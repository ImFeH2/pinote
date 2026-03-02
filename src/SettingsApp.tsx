import { useCallback, useEffect, useState } from "react";
import { exists, mkdir } from "@tauri-apps/plugin-fs";
import { getVersion } from "@tauri-apps/api/app";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useSettings } from "@/hooks/useSettings";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";
import { TitleBar } from "@/components/TitleBar";
import { ShortcutInput } from "@/components/ShortcutInput";
import { normalizeShortcut } from "@/lib/shortcuts";
import { resolveDefaultNotesDirectory } from "@/lib/notes";
import { searchNoteHistory, type NoteHistorySearchResult } from "@/lib/noteHistory";
import {
  type DragMouseButton,
  type WheelResizeModifier,
  type WindowsGlassEffect,
} from "@/stores/settings";
import {
  getRuntimePlatform,
  type RuntimePlatform,
  getDefaultMarkdownOpenEnabled,
  getOpenWithPinoteEnabled,
  setNoteWindowsSkipTaskbar,
  setDefaultMarkdownOpenEnabled,
  setOpenWithPinoteEnabled,
} from "@/lib/api";
import { openAndTrackNoteWindow } from "@/lib/windowManager";
import {
  checkForUpdates,
  downloadUpdate,
  getUpdateState,
  installUpdate,
  subscribeUpdateState,
  type UpdateSnapshot,
} from "@/lib/updater";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import { FolderOpen, FolderSearch, Github } from "lucide-react";

const REPOSITORY_URL = "https://github.com/ImFeH2/pinote";
const HISTORY_SEARCH_LIMIT = 80;
const HISTORY_SEARCH_DEBOUNCE_MS = 120;

const shortcutItems = [
  { key: "restoreWindow", label: "Restore Hidden Window" },
  { key: "toggleVisibleWindows", label: "Toggle Visible Windows" },
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

const dragMouseButtonOptions: Array<{ value: DragMouseButton; label: string }> = [
  { value: "middle", label: "Middle" },
  { value: "right", label: "Right" },
];

const windowsGlassEffectOptions: Array<{ value: WindowsGlassEffect; label: string }> = [
  { value: "mica", label: "Mica" },
  { value: "acrylic", label: "Acrylic" },
  { value: "blur", label: "Blur" },
  { value: "none", label: "Disabled" },
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
    id: "history",
    label: "History",
    description: "Search and reopen previously opened notes.",
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
  const [notesDirectoryError, setNotesDirectoryError] = useState<string | null>(null);
  const [notesDirectoryBusy, setNotesDirectoryBusy] = useState(false);
  const [defaultNotesDirectory, setDefaultNotesDirectory] = useState("");
  const [contextMenuBusy, setContextMenuBusy] = useState(false);
  const [contextMenuError, setContextMenuError] = useState<string | null>(null);
  const [defaultOpenBusy, setDefaultOpenBusy] = useState(false);
  const [defaultOpenError, setDefaultOpenError] = useState<string | null>(null);
  const [taskbarBusy, setTaskbarBusy] = useState(false);
  const [taskbarError, setTaskbarError] = useState<string | null>(null);
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyResults, setHistoryResults] = useState<NoteHistorySearchResult[]>([]);
  const [historyOpeningPath, setHistoryOpeningPath] = useState<string | null>(null);
  const [historyReloadToken, setHistoryReloadToken] = useState(0);
  const [runtimePlatform, setRuntimePlatform] = useState<RuntimePlatform>("other");

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
  const activeWheelOpacityModifier =
    wheelResizeModifierOptions.find((item) => item.value === settings.wheelOpacityModifier) ??
    wheelResizeModifierOptions[1];
  const activeDragMouseButton =
    dragMouseButtonOptions.find((item) => item.value === settings.dragMouseButton) ??
    dragMouseButtonOptions[0];
  const customNotesDirectory = settings.newNoteDirectory.trim();
  const effectiveNotesDirectory = customNotesDirectory || defaultNotesDirectory;

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

  const handleContextMenuIntegration = useCallback(async () => {
    const next = !settings.openWithPinoteContextMenu;
    setContextMenuBusy(true);
    try {
      const enabled = await setOpenWithPinoteEnabled(next);
      updateSettings({ openWithPinoteContextMenu: enabled });
      setContextMenuError(null);
    } catch (error) {
      setContextMenuError(getErrorMessage(error));
    } finally {
      setContextMenuBusy(false);
    }
  }, [settings.openWithPinoteContextMenu, updateSettings]);

  const handleDefaultOpenIntegration = useCallback(async () => {
    const next = !settings.defaultMarkdownOpenWithPinote;
    setDefaultOpenBusy(true);
    try {
      const enabled = await setDefaultMarkdownOpenEnabled(next);
      updateSettings({ defaultMarkdownOpenWithPinote: enabled });
      setDefaultOpenError(null);
    } catch (error) {
      setDefaultOpenError(getErrorMessage(error));
    } finally {
      setDefaultOpenBusy(false);
    }
  }, [settings.defaultMarkdownOpenWithPinote, updateSettings]);

  const handleTaskbarVisibility = useCallback(async () => {
    const next = !settings.hideNoteWindowsFromTaskbar;
    setTaskbarBusy(true);
    try {
      await setNoteWindowsSkipTaskbar(next);
      updateSettings({ hideNoteWindowsFromTaskbar: next });
      setTaskbarError(null);
    } catch (error) {
      setTaskbarError(getErrorMessage(error));
    } finally {
      setTaskbarBusy(false);
    }
  }, [settings.hideNoteWindowsFromTaskbar, updateSettings]);

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

  const handleChooseNotesDirectory = useCallback(async () => {
    setNotesDirectoryBusy(true);
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        defaultPath: effectiveNotesDirectory || undefined,
      });
      const selectedPath = Array.isArray(selected) ? selected[0] : selected;
      if (typeof selectedPath !== "string" || !selectedPath.trim()) return;
      updateSettings({ newNoteDirectory: selectedPath.trim() });
      setNotesDirectoryError(null);
    } catch (error) {
      setNotesDirectoryError(getErrorMessage(error));
    } finally {
      setNotesDirectoryBusy(false);
    }
  }, [effectiveNotesDirectory, updateSettings]);

  const handleOpenNotesDirectory = useCallback(async () => {
    const targetDirectory = effectiveNotesDirectory.trim();
    if (!targetDirectory) return;
    setNotesDirectoryBusy(true);
    try {
      if (!customNotesDirectory) {
        const directoryExists = await exists(targetDirectory);
        if (!directoryExists) {
          await mkdir(targetDirectory, { recursive: true });
        }
      }
      await openPath(targetDirectory);
      setNotesDirectoryError(null);
    } catch (error) {
      setNotesDirectoryError(getErrorMessage(error));
    } finally {
      setNotesDirectoryBusy(false);
    }
  }, [customNotesDirectory, effectiveNotesDirectory]);

  const handleOpenHistoryItem = useCallback(async (item: NoteHistorySearchResult) => {
    const notePath = item.notePath.trim();
    if (!notePath) return;
    setHistoryOpeningPath(notePath);
    try {
      await openAndTrackNoteWindow({
        noteId: item.noteId,
        notePath,
        windowId: item.windowId.trim() || undefined,
        visibility: "visible",
        focus: true,
      });
      setHistoryError(null);
      setHistoryReloadToken((value) => value + 1);
    } catch (error) {
      setHistoryError(getErrorMessage(error));
    } finally {
      setHistoryOpeningPath(null);
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
    let active = true;
    getOpenWithPinoteEnabled()
      .then((enabled) => {
        if (!active) return;
        if (settings.openWithPinoteContextMenu === enabled) return;
        updateSettings({ openWithPinoteContextMenu: enabled });
      })
      .catch((error) => {
        if (!active) return;
        setContextMenuError(getErrorMessage(error));
      });
    return () => {
      active = false;
    };
  }, [settings.openWithPinoteContextMenu, updateSettings]);

  useEffect(() => {
    let active = true;
    getDefaultMarkdownOpenEnabled()
      .then((enabled) => {
        if (!active) return;
        if (settings.defaultMarkdownOpenWithPinote === enabled) return;
        updateSettings({ defaultMarkdownOpenWithPinote: enabled });
      })
      .catch((error) => {
        if (!active) return;
        setDefaultOpenError(getErrorMessage(error));
      });
    return () => {
      active = false;
    };
  }, [settings.defaultMarkdownOpenWithPinote, updateSettings]);

  useEffect(() => {
    let active = true;
    resolveDefaultNotesDirectory()
      .then((directory) => {
        if (!active) return;
        setDefaultNotesDirectory(directory);
      })
      .catch((error) => {
        if (!active) return;
        setNotesDirectoryError(getErrorMessage(error));
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (activeSection !== "history") return;
    let active = true;
    const timer = window.setTimeout(() => {
      setHistoryLoading(true);
      searchNoteHistory(historyQuery, { limit: HISTORY_SEARCH_LIMIT })
        .then((results) => {
          if (!active) return;
          setHistoryResults(results);
          setHistoryError(null);
        })
        .catch((error) => {
          if (!active) return;
          setHistoryError(getErrorMessage(error));
        })
        .finally(() => {
          if (!active) return;
          setHistoryLoading(false);
        });
    }, HISTORY_SEARCH_DEBOUNCE_MS);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [activeSection, historyQuery, historyReloadToken]);

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

  useEffect(() => {
    let active = true;
    getRuntimePlatform()
      .then((platform) => {
        if (!active) return;
        setRuntimePlatform(platform);
      })
      .catch(() => {
        if (!active) return;
        setRuntimePlatform("other");
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

              {runtimePlatform !== "other" && (
                <div className="flex flex-col gap-3 rounded-md border border-border bg-background/60 p-3">
                  <div className="text-xs font-medium text-muted-foreground">Glass Effect</div>
                  {runtimePlatform === "windows" ? (
                    <div className="flex flex-col gap-2">
                      <div className="grid grid-cols-2 gap-2">
                        {windowsGlassEffectOptions.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => updateSettings({ noteGlassEffectWindows: option.value })}
                            className={cn(
                              "rounded-md border px-2 py-1 text-xs font-medium transition-colors",
                              settings.noteGlassEffectWindows === option.value
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border bg-background text-muted-foreground hover:bg-accent",
                            )}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Applies to all note windows.
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-muted-foreground">Enable Glass Effect</div>
                      <button
                        type="button"
                        onClick={() =>
                          updateSettings({
                            noteGlassEffectMacos: !settings.noteGlassEffectMacos,
                          })
                        }
                        className={cn(
                          "rounded-md border px-2 py-1 text-xs font-medium transition-colors",
                          settings.noteGlassEffectMacos
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background text-muted-foreground hover:bg-accent",
                        )}
                      >
                        {settings.noteGlassEffectMacos ? "Enabled" : "Disabled"}
                      </button>
                    </div>
                  )}
                </div>
              )}

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
                Always-on-top state is independent per note window. Use middle click or shortcut in
                each note to toggle.
              </div>

              <div className="flex flex-col gap-2 rounded-md border border-border bg-background/60 p-3">
                <div className="text-xs font-medium text-muted-foreground">New Note Directory</div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={settings.newNoteDirectory}
                    onChange={(event) => {
                      updateSettings({ newNoteDirectory: event.target.value });
                      setNotesDirectoryError(null);
                    }}
                    placeholder={defaultNotesDirectory || "Loading default directory..."}
                    disabled={notesDirectoryBusy}
                    className={cn(
                      "h-8 flex-1 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none transition-colors focus:border-primary",
                      notesDirectoryBusy && "cursor-not-allowed opacity-60",
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      void handleChooseNotesDirectory();
                    }}
                    disabled={notesDirectoryBusy}
                    className={cn(
                      "inline-flex h-8 w-8 items-center justify-center rounded-md border text-muted-foreground transition-colors",
                      "border-border bg-background text-muted-foreground hover:bg-accent",
                      notesDirectoryBusy && "cursor-not-allowed opacity-60",
                    )}
                    aria-label="Choose directory"
                    title="Choose directory"
                  >
                    <FolderSearch className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    disabled={notesDirectoryBusy || !effectiveNotesDirectory}
                    onClick={() => {
                      void handleOpenNotesDirectory();
                    }}
                    className={cn(
                      "inline-flex h-8 w-8 items-center justify-center rounded-md border text-muted-foreground transition-colors",
                      "border-border bg-background text-muted-foreground hover:bg-accent",
                      (notesDirectoryBusy || !effectiveNotesDirectory) &&
                        "cursor-not-allowed opacity-60",
                    )}
                    aria-label="Open directory"
                    title="Open directory"
                  >
                    <FolderOpen className="h-4 w-4" />
                  </button>
                </div>
                {notesDirectoryError && (
                  <div className="text-xs text-destructive">{notesDirectoryError}</div>
                )}
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

              <div className="flex items-center justify-between rounded-md border border-border bg-background/60 p-3">
                <div className="flex flex-col gap-1">
                  <div className="text-xs font-medium text-muted-foreground">
                    Hide Note Windows From Taskbar
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Control whether note windows are hidden from the system taskbar.
                  </div>
                </div>
                <button
                  type="button"
                  disabled={taskbarBusy}
                  onClick={() => {
                    void handleTaskbarVisibility();
                  }}
                  className={cn(
                    "rounded-md border px-2 py-1 text-xs font-medium transition-colors",
                    settings.hideNoteWindowsFromTaskbar
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground hover:bg-accent",
                    taskbarBusy && "cursor-not-allowed opacity-60",
                  )}
                >
                  {settings.hideNoteWindowsFromTaskbar ? "Enabled" : "Disabled"}
                </button>
              </div>

              {taskbarError && <div className="text-xs text-destructive">{taskbarError}</div>}

              <div className="flex items-center justify-between rounded-md border border-border bg-background/60 p-3">
                <div className="flex flex-col gap-1">
                  <div className="text-xs font-medium text-muted-foreground">
                    Explorer Context Menu
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Adds "Use Pinote to Open" for .md and .markdown files.
                  </div>
                </div>
                <button
                  type="button"
                  disabled={contextMenuBusy}
                  onClick={() => {
                    void handleContextMenuIntegration();
                  }}
                  className={cn(
                    "rounded-md border px-2 py-1 text-xs font-medium transition-colors",
                    settings.openWithPinoteContextMenu
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground hover:bg-accent",
                    contextMenuBusy && "cursor-not-allowed opacity-60",
                  )}
                >
                  {settings.openWithPinoteContextMenu ? "Enabled" : "Disabled"}
                </button>
              </div>

              {contextMenuError && (
                <div className="text-xs text-destructive">{contextMenuError}</div>
              )}

              <div className="flex items-center justify-between rounded-md border border-border bg-background/60 p-3">
                <div className="flex flex-col gap-1">
                  <div className="text-xs font-medium text-muted-foreground">
                    Default Markdown Opener
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Set Pinote as default opener for .md and .markdown files.
                  </div>
                </div>
                <button
                  type="button"
                  disabled={defaultOpenBusy}
                  onClick={() => {
                    void handleDefaultOpenIntegration();
                  }}
                  className={cn(
                    "rounded-md border px-2 py-1 text-xs font-medium transition-colors",
                    settings.defaultMarkdownOpenWithPinote
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground hover:bg-accent",
                    defaultOpenBusy && "cursor-not-allowed opacity-60",
                  )}
                >
                  {settings.defaultMarkdownOpenWithPinote ? "Enabled" : "Disabled"}
                </button>
              </div>

              {defaultOpenError && (
                <div className="text-xs text-destructive">{defaultOpenError}</div>
              )}
            </div>
          )}

          {activeSection === "history" && (
            <div className="flex h-full min-h-0 flex-col gap-3">
              <input
                type="text"
                value={historyQuery}
                onChange={(event) => {
                  setHistoryQuery(event.target.value);
                }}
                placeholder="Search by path or note content"
                className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none transition-colors focus:border-primary"
              />
              <div className="pinote-scrollbar min-h-0 flex-1 overflow-y-auto rounded-md border border-border bg-background/70">
                {historyLoading ? (
                  <div className="px-2 py-2 text-xs text-muted-foreground">Searching...</div>
                ) : historyResults.length === 0 ? (
                  <div className="px-2 py-2 text-xs text-muted-foreground">No results.</div>
                ) : (
                  historyResults.map((item) => {
                    const key = `${item.notePath}::${item.windowId}`;
                    const opening = historyOpeningPath === item.notePath;
                    return (
                      <button
                        key={key}
                        type="button"
                        disabled={opening}
                        onClick={() => {
                          void handleOpenHistoryItem(item);
                        }}
                        className={cn(
                          "flex w-full flex-col gap-1 border-b border-border/70 px-2 py-2 text-left transition-colors last:border-b-0 hover:bg-accent",
                          opening && "cursor-not-allowed opacity-60",
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <div className="min-w-0 flex-1 truncate text-xs text-foreground">
                            {item.notePath}
                          </div>
                          {item.matchedByContent && (
                            <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                              Content
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground">{`Last opened: ${formatDateTime(item.lastOpenedAt)}`}</div>
                      </button>
                    );
                  })
                )}
              </div>
              {historyError && <div className="text-xs text-destructive">{historyError}</div>}
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

              <div className="flex flex-col gap-2 rounded-md border border-border bg-background/60 p-3">
                <div className="text-xs font-medium text-muted-foreground">
                  Wheel Opacity Modifier
                </div>
                <div className="flex items-center gap-2">
                  {wheelResizeModifierOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => updateSettings({ wheelOpacityModifier: option.value })}
                      className={cn(
                        "flex-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors",
                        settings.wheelOpacityModifier === option.value
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-muted-foreground hover:bg-accent",
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <div className="text-xs text-muted-foreground">{`${activeWheelOpacityModifier.label} + Wheel adjusts window opacity.`}</div>
              </div>

              <div className="flex flex-col gap-2 rounded-md border border-border bg-background/60 p-3">
                <div className="text-xs font-medium text-muted-foreground">Drag Mouse Button</div>
                <div className="flex items-center gap-2">
                  {dragMouseButtonOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => updateSettings({ dragMouseButton: option.value })}
                      className={cn(
                        "flex-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors",
                        settings.dragMouseButton === option.value
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-muted-foreground hover:bg-accent",
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <div className="text-xs text-muted-foreground">{`${activeDragMouseButton.label} Drag: Move window`}</div>
              </div>

              <div className="flex flex-col gap-1 rounded-md border border-border bg-background/60 p-3">
                <div className="text-xs font-medium text-muted-foreground">
                  Current Interactions
                </div>
                <div className="text-xs text-muted-foreground">{`${activeWheelResizeModifier.label} + Wheel: Resize window around cursor`}</div>
                <div className="text-xs text-muted-foreground">{`${activeWheelOpacityModifier.label} + Wheel: Adjust window opacity`}</div>
                <div className="text-xs text-muted-foreground">
                  Middle Click: Toggle Always On Top
                </div>
                <div className="text-xs text-muted-foreground">{`${activeDragMouseButton.label} Drag: Move window`}</div>
                <div className="text-xs text-muted-foreground">
                  {activeDragMouseButton.value === "right"
                    ? "Right Click: Open context menu (click) / Drag window (drag)"
                    : "Right Click: Open context menu"}
                </div>
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
