import { useCallback, useEffect, useState } from "react";
import { useSettings } from "@/hooks/useSettings";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";
import { TitleBar } from "@/components/TitleBar";
import { ShortcutInput } from "@/components/ShortcutInput";
import { normalizeShortcut } from "@/lib/shortcuts";
import {
  checkForUpdates,
  downloadUpdate,
  getUpdateState,
  installUpdate,
  subscribeUpdateState,
  type UpdateSnapshot,
} from "@/lib/updater";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";

const shortcutItems = [
  { key: "toggleWindow", label: "Toggle Window" },
  { key: "toggleAlwaysOnTop", label: "Toggle Always On Top" },
  { key: "toggleTheme", label: "Toggle Theme" },
  { key: "hideWindow", label: "Hide Window" },
] as const;

const themeOptions = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const;

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
  if (snapshot.state === "readyToRestart")
    return "Download complete. Restart to install the update.";
  if (snapshot.state === "error") return snapshot.error ?? "Update failed.";
  return "Update status is unavailable.";
}

export function SettingsApp() {
  useTheme();
  const { settings, updateSettings } = useSettings();
  const [shortcutError, setShortcutError] = useState<string | null>(null);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [startupBusy, setStartupBusy] = useState(false);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [updateActionError, setUpdateActionError] = useState<string | null>(null);
  const [updateSnapshot, setUpdateSnapshot] = useState<UpdateSnapshot>(() => getUpdateState());
  const opacityPercent = Math.round(settings.opacity * 100);
  const canDownloadUpdate =
    updateSnapshot.state === "available" ||
    (updateSnapshot.available && updateSnapshot.state === "error");
  const canInstallUpdate = updateSnapshot.state === "readyToRestart";
  const updateStatusText = getUpdateStatusText(updateSnapshot);
  const updateError = updateActionError ?? updateSnapshot.error;
  const isCheckingUpdate = updateSnapshot.state === "checking";
  const isDownloadingUpdate = updateSnapshot.state === "downloading";

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

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <TitleBar title="Settings" showSettings={false} />

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
        <div className="flex flex-col gap-2">
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

        <div className="flex items-center justify-between">
          <div className="text-xs font-medium text-muted-foreground">Always On Top</div>
          <button
            type="button"
            onClick={() => updateSettings({ alwaysOnTop: !settings.alwaysOnTop })}
            className={cn(
              "rounded-md border px-2 py-1 text-xs font-medium transition-colors",
              settings.alwaysOnTop
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:bg-accent",
            )}
          >
            {settings.alwaysOnTop ? "Enabled" : "Disabled"}
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium text-muted-foreground">Opacity</div>
            <div className="text-xs text-muted-foreground">{opacityPercent}%</div>
          </div>
          <input
            type="range"
            min={30}
            max={100}
            value={opacityPercent}
            onChange={(e) => updateSettings({ opacity: Number(e.target.value) / 100 })}
            className="h-1 w-full cursor-pointer accent-primary"
          />
        </div>

        <div className="flex items-center justify-between">
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

        <div className="flex flex-col gap-2">
          <div className="text-xs font-medium text-muted-foreground">Shortcuts</div>
          {shortcutItems.map((item) => (
            <ShortcutInput
              key={item.key}
              label={item.label}
              value={settings.shortcuts[item.key]}
              onChange={(value) => updateShortcut(item.key, value)}
            />
          ))}
          <div className="text-xs text-muted-foreground">Toggle Window is global.</div>
          {shortcutError && <div className="text-xs text-destructive">{shortcutError}</div>}
        </div>
      </div>
    </div>
  );
}
