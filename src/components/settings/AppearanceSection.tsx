import { cn } from "@/lib/utils";
import { type SettingsPatch } from "@/stores/settingsStore";
import { type Settings } from "@/stores/settings";
import { type RuntimePlatform } from "@/lib/windowApi";
import {
  fontFamilyOptions,
  themeOptions,
  windowsGlassEffectOptions,
} from "@/components/settings/shared";

interface AppearanceSectionProps {
  settings: Settings;
  runtimePlatform: RuntimePlatform;
  lineHeightText: string;
  paddingXText: string;
  paddingYText: string;
  updateSettings: (patch: SettingsPatch) => void;
}

export function AppearanceSection({
  settings,
  runtimePlatform,
  lineHeightText,
  paddingXText,
  paddingYText,
  updateSettings,
}: AppearanceSectionProps) {
  return (
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
            onChange={(event) => updateSettings({ editorFontSize: Number(event.target.value) })}
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
            onChange={(event) => updateSettings({ editorLineHeight: Number(event.target.value) })}
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
              <div className="text-xs text-muted-foreground">Applies to all note windows.</div>
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
            onChange={(event) => updateSettings({ editorPaddingX: Number(event.target.value) })}
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
            onChange={(event) => updateSettings({ editorPaddingY: Number(event.target.value) })}
            className="h-1 w-full cursor-pointer accent-primary"
          />
        </div>
      </div>
    </div>
  );
}
