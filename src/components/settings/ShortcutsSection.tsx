import {
  dragMouseButtonOptions,
  globalShortcutKeys,
  shortcutItems,
  type GlobalShortcutKey,
  type ShortcutKey,
  wheelResizeModifierOptions,
} from "@/components/settings/shared";
import { ShortcutInput } from "@/components/ShortcutInput";
import { cn } from "@/lib/utils";
import { type Settings } from "@/stores/settings";
import { type SettingsPatch } from "@/stores/settingsStore";

interface ShortcutsSectionProps {
  settings: Settings;
  shortcutError: string | null;
  globalShortcutRegistration: Record<GlobalShortcutKey, boolean | null>;
  activeWheelResizeModifier: (typeof wheelResizeModifierOptions)[number];
  activeWheelOpacityModifier: (typeof wheelResizeModifierOptions)[number];
  activeDragMouseButton: (typeof dragMouseButtonOptions)[number];
  updateShortcut: (key: ShortcutKey, value: string) => void;
  updateSettings: (patch: SettingsPatch) => void;
}

export function ShortcutsSection({
  settings,
  shortcutError,
  globalShortcutRegistration,
  activeWheelResizeModifier,
  activeWheelOpacityModifier,
  activeDragMouseButton,
  updateShortcut,
  updateSettings,
}: ShortcutsSectionProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-md border border-border bg-background/60 p-3">
        <div className="text-xs font-medium text-muted-foreground">Keyboard Shortcuts</div>
        {shortcutItems.map((item) => (
          <ShortcutInput
            key={item.key}
            label={item.label}
            value={settings.shortcuts[item.key]}
            onChange={(value) => updateShortcut(item.key, value)}
            labelMeta={
              globalShortcutKeys.includes(item.key as GlobalShortcutKey) ? (
                <span
                  title={
                    globalShortcutRegistration[item.key as GlobalShortcutKey] === true
                      ? "Global shortcut registered"
                      : globalShortcutRegistration[item.key as GlobalShortcutKey] === false
                        ? "Global shortcut not registered"
                        : "Checking global shortcut status"
                  }
                  className={cn(
                    "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium",
                    globalShortcutRegistration[item.key as GlobalShortcutKey] === true
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : globalShortcutRegistration[item.key as GlobalShortcutKey] === false
                        ? "border-destructive/40 bg-destructive/10 text-destructive"
                        : "border-border bg-background/60 text-muted-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      globalShortcutRegistration[item.key as GlobalShortcutKey] === true
                        ? "bg-emerald-500"
                        : globalShortcutRegistration[item.key as GlobalShortcutKey] === false
                          ? "bg-destructive"
                          : "bg-muted-foreground/50",
                    )}
                  />
                  Global
                </span>
              ) : null
            }
          />
        ))}
        <div className="text-xs text-muted-foreground">
          New Note, Restore Hidden Window, Show All Hidden Windows, and Toggle Visible Windows are
          global. If a global shortcut is already used by another app, it will be skipped. The
          Global badge indicates whether the shortcut is registered.
        </div>
        {shortcutError && <div className="text-xs text-destructive">{shortcutError}</div>}
      </div>

      <div className="flex flex-col gap-2 rounded-md border border-border bg-background/60 p-3">
        <div className="text-xs font-medium text-muted-foreground">Wheel Resize Modifier</div>
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
        <div className="text-xs font-medium text-muted-foreground">Wheel Opacity Modifier</div>
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
        <div className="text-xs font-medium text-muted-foreground">Current Interactions</div>
        <div className="text-xs text-muted-foreground">{`${activeWheelResizeModifier.label} + Wheel: Resize window around cursor`}</div>
        <div className="text-xs text-muted-foreground">{`${activeWheelOpacityModifier.label} + Wheel: Adjust window opacity`}</div>
        <div className="text-xs text-muted-foreground">Middle Click: Toggle Always On Top</div>
        <div className="text-xs text-muted-foreground">{`${activeDragMouseButton.label} Drag: Move window`}</div>
        <div className="text-xs text-muted-foreground">
          {activeDragMouseButton.value === "right"
            ? "Right Click: Open context menu (click) / Drag window (drag)"
            : "Right Click: Open context menu"}
        </div>
      </div>
    </div>
  );
}
