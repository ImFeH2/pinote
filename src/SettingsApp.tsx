import { useSettings } from "@/hooks/useSettings";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";
import { TitleBar } from "@/components/TitleBar";

const themeOptions = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const;

export function SettingsApp() {
  useTheme();
  const { settings, updateSettings } = useSettings();
  const opacityPercent = Math.round(settings.opacity * 100);

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
      </div>
    </div>
  );
}
