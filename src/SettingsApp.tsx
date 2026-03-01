import { useCallback, useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { useSettings } from "@/hooks/useSettings";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";
import { TitleBar } from "@/components/TitleBar";
import { ShortcutInput } from "@/components/ShortcutInput";
import { normalizeShortcut } from "@/lib/shortcuts";
import { type WheelResizeModifier } from "@/stores/settings";
import {
  checkForUpdates,
  downloadUpdate,
  getUpdateState,
  installUpdate,
  subscribeUpdateState,
  type UpdateSnapshot,
} from "@/lib/updater";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Github } from "lucide-react";

const REPOSITORY_URL = "https://github.com/ImFeH2/pinote";

const shortcutItems = [
  { key: "restoreWindow", label: "Restore Hidden Window" },
  { key: "toggleAlwaysOnTop", label: "Toggle Always On Top" },
  { key: "toggleTheme", label: "Toggle Theme" },
  { key: "hideWindow", label: "Hide Window" },
] as const;

const themeOptions = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const;

const fontFamilyOptions = [
  { value: "system", label: "System" },
  { value: "serif", label: "Serif" },
  { value: "mono", label: "Monospace" },
] as const;

const wheelResizeModifierOptions: Array<{ value: WheelResizeModifier; label: string }> = [
  { value: "alt", label: "Alt" },
  { value: "ctrl", label: "Ctrl" },
  { value: "shift", label: "Shift" },
  { value: "meta", label: "Meta" },
];

const sections = [
  {
    id: "appearance",
    label: "Appearance",
    description: "Theme and visual style settings.",
  },
  {
    id: "window",
    label: "Window",
    description: "Window behavior and startup settings.",
  },
  {
    id: "shortcuts",
    label: "Shortcuts",
    description: "Keyboard shortcuts and interaction key customization.",
  },
  {
    id: "about",
    label: "About",
    description: "Version, updates, and project resources.",
  },
] as const;

type SettingsSection = (typeof sections)[number]["id"];

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getUpdateStatusText(snapshot: UpdateSnapshot) {
  if (snapshot.state === "idle") return "No update check has been run yet.";
  if (snapshot.state === "checking") return "Checking for updates...";
  if (snapshot.state === "available") {
    return `Update ${snapshot.latestVersion ?? "unknown"} is available.`;
  }
  if (snapshot.state === "upToDate") return "You are using the latest stable release.";
  if (snapshot.state === "downloading") {
    if (snapshot.downloadProgress !== null) {
      return `Downloading update... ${snapshot.downloadProgress}%`;
    }
    return "Downloading update...";
  }
  if (snapshot.state === "readyToRestart") {
    return "Download complete. Restart to install the update.";
  }
  if (snapshot.state === "error") return snapshot.error ?? "Update failed.";
  return "Update status is unavailable.";
}

export function SettingsApp() {
  useTheme();
  const { settings, updateSettings } = useSettings();
  const [activeSection, setActiveSection] = useState<SettingsSection>("appearance");
  const [shortcutError, setShortcutError] = useState<string | null>(null);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [startupBusy, setStartupBusy] = useState(false);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [updateActionError, setUpdateActionError] = useState<string | null>(null);
  const [updateSnapshot, setUpdateSnapshot] = useState<UpdateSnapshot>(() => getUpdateState());
  const [appVersion, setAppVersion] = useState("loading...");
  const [aboutError, setAboutError] = useState<string | null>(null);

  const activeSectionInfo = sections.find((section) => section.id === activeSection) ?? sections[0];
  const lineHeightText = settings.editorLineHeight.toFixed(1);
  const paddingXText = `${settings.editorPaddingX}px`;
  const paddingYText = `${settings.editorPaddingY}px`;
  const canDownloadUpdate =
    updateSnapshot.state === "available" ||
    (updateSnapshot.available && updateSnapshot.state === "error");
  const canInstallUpdate = updateSnapshot.state === "readyToRestart";
  const updateStatusText = getUpdateStatusText(updateSnapshot);
  const updateError = updateActionError ?? updateSnapshot.error;
  const isCheckingUpdate = updateSnapshot.state === "checking";
  const isDownloadingUpdate = updateSnapshot.state === "downloading";
  const activeWheelResizeModifier =
    wheelResizeModifierOptions.find((item) => item.value === settings.wheelResizeModifier) ??
    wheelResizeModifierOptions[0];

  const updateShortcut = useCallback(
    (key: (typeof shortcutItems)[number]["key"], value: string) => {
      const normalized = normalizeShortcut(value);
      if (!normalized) {
        setShortcutError("Invalid shortcut.");
        return;
      }

      setShortcutError(null);
      updateSettings({
        shortcuts: {
          [key]: normalized,
        },
      });
    },
    [updateSettings],
  );

  const handleLaunchAtStartup = useCallback(async () => {
    const next = !settings.launchAtStartup;
    setStartupBusy(true);
    try {
      if (next) {
        await enable();
      } else {
        await disable();
      }
      setStartupError(null);
      updateSettings({ launchAtStartup: next });
    } catch (error) {
      setStartupError(getErrorMessage(error));
    } finally {
      setStartupBusy(false);
    }
  }, [settings.launchAtStartup, updateSettings]);

  const handleManualUpdateCheck = useCallback(async () => {
    setUpdateBusy(true);
    setUpdateActionError(null);
    try {
      await checkForUpdates("manual");
    } catch (error) {
      setUpdateActionError(getErrorMessage(error));
    } finally {
      setUpdateBusy(false);
    }
  }, []);

  const handleDownloadUpdate = useCallback(async () => {
    setUpdateBusy(true);
    setUpdateActionError(null);
    try {
      await downloadUpdate();
    } catch (error) {
      setUpdateActionError(getErrorMessage(error));
    } finally {
      setUpdateBusy(false);
    }
  }, []);

  const handleInstallUpdate = useCallback(async () => {
    setUpdateBusy(true);
    setUpdateActionError(null);
    try {
      await installUpdate();
    } catch (error) {
      setUpdateActionError(getErrorMessage(error));
    } finally {
      setUpdateBusy(false);
    }
  }, []);

  const handleOpenRepository = useCallback(async () => {
    try {
      await openUrl(REPOSITORY_URL);
      setAboutError(null);
    } catch (error) {
      setAboutError(getErrorMessage(error));
    }
  }, []);

  useEffect(() => {
    let active = true;
    isEnabled()
      .then((enabled) => {
        if (!active) return;
        updateSettings({ launchAtStartup: enabled });
      })
      .catch((error) => {
        if (!active) return;
        setStartupError(getErrorMessage(error));
      });
    return () => {
      active = false;
    };
  }, [updateSettings]);

  useEffect(() => {
    return subscribeUpdateState((next) => {
      setUpdateSnapshot(next);
    });
  }, []);

  useEffect(() => {
    if (!settings.lastUpdateCheckAt && updateSnapshot.state === "idle") {
      checkForUpdates("silent").catch(() => {});
    }
  }, [settings.lastUpdateCheckAt, updateSnapshot.state]);

  useEffect(() => {
    if (!updateSnapshot.lastCheckedAt) return;
    if (settings.lastUpdateCheckAt === updateSnapshot.lastCheckedAt) return;
    updateSettings({ lastUpdateCheckAt: updateSnapshot.lastCheckedAt });
  }, [settings.lastUpdateCheckAt, updateSettings, updateSnapshot.lastCheckedAt]);

  useEffect(() => {
    let active = true;
    getVersion()
      .then((version) => {
        if (!active) return;
        setAppVersion(version);
      })
      .catch(() => {
        if (!active) return;
        setAppVersion("unknown");
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <TitleBar title="Settings" showSettings={false} />

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-48 shrink-0 flex-col border-r border-border bg-background/60 p-2">
          {sections.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => setActiveSection(section.id)}
              className={cn(
                "mb-1 rounded-md px-3 py-2 text-left text-xs font-medium transition-colors",
                activeSection === section.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              {section.label}
            </button>
          ))}
        </aside>

        <main className="pinote-scrollbar min-w-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-4">
            <div className="text-sm font-semibold text-foreground">{activeSectionInfo.label}</div>
            <div className="text-xs text-muted-foreground">{activeSectionInfo.description}</div>
          </div>

          {activeSection === "appearance" && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2 rounded-md border border-border bg-background/60 p-3">
                <div className="text-xs font-medium text-muted-foreground">Theme</div>
                <div className="flex items-center gap-2">
                  {themeOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => updateSettings({ theme: option.value })}
                      className={cn(
                        "flex-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors",
                        settings.theme === option.value
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-muted-foreground hover:bg-accent",
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-3 rounded-md border border-border bg-background/60 p-3">
                <div className="text-xs font-medium text-muted-foreground">Typography</div>

                <div className="flex flex-col gap-2">
                  <div className="text-xs text-muted-foreground">Font Family</div>
                  <div className="flex items-center gap-2">
                    {fontFamilyOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => updateSettings({ editorFontFamily: option.value })}
                        className={cn(
                          "flex-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors",
                          settings.editorFontFamily === option.value
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background text-muted-foreground hover:bg-accent",
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-muted-foreground">Font Size</div>
                    <div className="text-xs text-muted-foreground">{`${settings.editorFontSize}px`}</div>
                  </div>
                  <input
                    type="range"
                    min={12}
                    max={24}
                    step={1}
                    value={settings.editorFontSize}
                    onChange={(event) =>
                      updateSettings({ editorFontSize: Number(event.target.value) })
                    }
                    className="h-1 w-full cursor-pointer accent-primary"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-muted-foreground">Line Height</div>
                    <div className="text-xs text-muted-foreground">{lineHeightText}</div>
                  </div>
                  <input
                    type="range"
                    min={1.2}
                    max={2.2}
                    step={0.1}
                    value={settings.editorLineHeight}
                    onChange={(event) =>
                      updateSettings({ editorLineHeight: Number(event.target.value) })
                    }
                    className="h-1 w-full cursor-pointer accent-primary"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-3 rounded-md border border-border bg-background/60 p-3">
                <div className="text-xs font-medium text-muted-foreground">Page Spacing</div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-muted-foreground">Horizontal Margin</div>
                    <div className="text-xs text-muted-foreground">{paddingXText}</div>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={64}
                    step={1}
                    value={settings.editorPaddingX}
                    onChange={(event) =>
                      updateSettings({ editorPaddingX: Number(event.target.value) })
                    }
                    className="h-1 w-full cursor-pointer accent-primary"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-muted-foreground">Vertical Margin</div>
                    <div className="text-xs text-muted-foreground">{paddingYText}</div>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={64}
                    step={1}
                    value={settings.editorPaddingY}
                    onChange={(event) =>
                      updateSettings({ editorPaddingY: Number(event.target.value) })
                    }
                    className="h-1 w-full cursor-pointer accent-primary"
                  />
                </div>
              </div>
            </div>
          )}

          {activeSection === "window" && (
            <div className="flex flex-col gap-4">
              <div className="rounded-md border border-border bg-background/60 p-3 text-xs text-muted-foreground">
                Always-on-top state is independent per note window. Use middle click or context menu
                in each note to toggle.
              </div>

              <div className="flex items-center justify-between rounded-md border border-border bg-background/60 p-3">
                <div className="text-xs font-medium text-muted-foreground">Launch At Startup</div>
                <button
                  type="button"
                  disabled={startupBusy}
                  onClick={() => {
                    void handleLaunchAtStartup();
                  }}
                  className={cn(
                    "rounded-md border px-2 py-1 text-xs font-medium transition-colors",
                    settings.launchAtStartup
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground hover:bg-accent",
                    startupBusy && "cursor-not-allowed opacity-60",
                  )}
                >
                  {settings.launchAtStartup ? "Enabled" : "Disabled"}
                </button>
              </div>

              {startupError && <div className="text-xs text-destructive">{startupError}</div>}
            </div>
          )}

          {activeSection === "shortcuts" && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2 rounded-md border border-border bg-background/60 p-3">
                <div className="text-xs font-medium text-muted-foreground">Keyboard Shortcuts</div>
                {shortcutItems.map((item) => (
                  <ShortcutInput
                    key={item.key}
                    label={item.label}
                    value={settings.shortcuts[item.key]}
                    onChange={(value) => updateShortcut(item.key, value)}
                  />
                ))}
                <div className="text-xs text-muted-foreground">
                  Restore Hidden Window is global.
                </div>
                {shortcutError && <div className="text-xs text-destructive">{shortcutError}</div>}
              </div>

              <div className="flex flex-col gap-2 rounded-md border border-border bg-background/60 p-3">
                <div className="text-xs font-medium text-muted-foreground">
                  Wheel Resize Modifier
                </div>
                <div className="flex items-center gap-2">
                  {wheelResizeModifierOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => updateSettings({ wheelResizeModifier: option.value })}
                      className={cn(
                        "flex-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors",
                        settings.wheelResizeModifier === option.value
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-muted-foreground hover:bg-accent",
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <div className="text-xs text-muted-foreground">{`${activeWheelResizeModifier.label} + Wheel resizes the window around cursor.`}</div>
              </div>

              <div className="flex flex-col gap-1 rounded-md border border-border bg-background/60 p-3">
                <div className="text-xs font-medium text-muted-foreground">
                  Current Interactions
                </div>
                <div className="text-xs text-muted-foreground">{`${activeWheelResizeModifier.label} + Wheel: Resize window around cursor`}</div>
                <div className="text-xs text-muted-foreground">
                  Middle Click: Toggle Always On Top
                </div>
                <div className="text-xs text-muted-foreground">Middle Drag: Move window</div>
                <div className="text-xs text-muted-foreground">Right Click: Open context menu</div>
              </div>
            </div>
          )}

          {activeSection === "about" && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2 rounded-md border border-border bg-background/60 p-3">
                <div className="text-xs font-medium text-muted-foreground">Application</div>
                <div className="flex items-center justify-between">
                  <div className="text-xs text-muted-foreground">Name</div>
                  <div className="text-xs font-medium text-foreground">Pinote</div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-xs text-muted-foreground">Current Version</div>
                  <div className="text-xs font-medium text-foreground">{appVersion}</div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-xs text-muted-foreground">Release Channel</div>
                  <div className="text-xs font-medium text-foreground">Stable</div>
                </div>
              </div>

              <div className="flex flex-col gap-2 rounded-md border border-border bg-background/60 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-medium text-muted-foreground">Updates</div>
                  <button
                    type="button"
                    disabled={updateBusy || isCheckingUpdate || isDownloadingUpdate}
                    onClick={() => {
                      void handleManualUpdateCheck();
                    }}
                    className={cn(
                      "rounded-md border px-2 py-1 text-xs font-medium transition-colors",
                      "border-border bg-background text-muted-foreground hover:bg-accent",
                      (updateBusy || isCheckingUpdate || isDownloadingUpdate) &&
                        "cursor-not-allowed opacity-60",
                    )}
                  >
                    {isCheckingUpdate ? "Checking..." : "Check Updates"}
                  </button>
                </div>

                <div className="text-xs text-muted-foreground">{updateStatusText}</div>

                {updateSnapshot.latestVersion && (
                  <div className="text-xs text-muted-foreground">
                    {`Current ${updateSnapshot.currentVersion || "unknown"} -> Latest ${updateSnapshot.latestVersion}`}
                  </div>
                )}

                {isDownloadingUpdate && updateSnapshot.downloadProgress !== null && (
                  <div className="text-xs text-muted-foreground">{`Progress ${updateSnapshot.downloadProgress}%`}</div>
                )}

                {canDownloadUpdate && (
                  <button
                    type="button"
                    disabled={updateBusy || isDownloadingUpdate || isCheckingUpdate}
                    onClick={() => {
                      void handleDownloadUpdate();
                    }}
                    className={cn(
                      "rounded-md border px-2 py-1 text-xs font-medium transition-colors",
                      "border-primary bg-primary text-primary-foreground hover:opacity-90",
                      (updateBusy || isDownloadingUpdate || isCheckingUpdate) &&
                        "cursor-not-allowed opacity-60",
                    )}
                  >
                    {isDownloadingUpdate ? "Downloading..." : "Download Update"}
                  </button>
                )}

                {canInstallUpdate && (
                  <button
                    type="button"
                    disabled={updateBusy}
                    onClick={() => {
                      void handleInstallUpdate();
                    }}
                    className={cn(
                      "rounded-md border px-2 py-1 text-xs font-medium transition-colors",
                      "border-primary bg-primary text-primary-foreground hover:opacity-90",
                      updateBusy && "cursor-not-allowed opacity-60",
                    )}
                  >
                    {updateBusy ? "Installing..." : "Restart to Install"}
                  </button>
                )}

                {settings.lastUpdateCheckAt && (
                  <div className="text-[11px] text-muted-foreground">
                    {`Last checked at ${formatDateTime(settings.lastUpdateCheckAt)}`}
                  </div>
                )}

                {updateError && <div className="text-xs text-destructive">{updateError}</div>}
              </div>

              <div className="flex flex-col gap-2 rounded-md border border-border bg-background/60 p-3">
                <div className="text-xs font-medium text-muted-foreground">Project</div>
                <button
                  type="button"
                  onClick={() => {
                    void handleOpenRepository();
                  }}
                  className="inline-flex items-center gap-2 self-start rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                >
                  <Github size={14} />
                  <span>Pinote</span>
                </button>
                <div className="truncate text-[11px] text-muted-foreground">{REPOSITORY_URL}</div>
              </div>

              {aboutError && <div className="text-xs text-destructive">{aboutError}</div>}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
