import { useCallback, useEffect, useState } from "react";
import { useSettings } from "@/hooks/useSettings";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";
import { TitleBar } from "@/components/TitleBar";
import { ShortcutInput } from "@/components/ShortcutInput";
import { normalizeShortcut } from "@/lib/shortcuts";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { updateToggleWindowShortcut } from "@/lib/api";

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

export function SettingsApp() {
  useTheme();
  const { settings, updateSettings } = useSettings();
  const [shortcutError, setShortcutError] = useState<string | null>(null);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [startupBusy, setStartupBusy] = useState(false);
  const opacityPercent = Math.round(settings.opacity * 100);

  const updateShortcut = useCallback(
    async (key: (typeof shortcutItems)[number]["key"], value: string) => {
      const normalized = normalizeShortcut(value);
      if (!normalized) {
        setShortcutError("Invalid shortcut.");
        return;
      }

      if (key === "toggleWindow") {
        try {
          await updateToggleWindowShortcut(normalized);
        } catch (error) {
          setShortcutError(getErrorMessage(error));
          return;
        }
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
