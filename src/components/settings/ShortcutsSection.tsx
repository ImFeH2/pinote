import { useTranslation } from "react-i18next";
import { ShortcutInput } from "@/components/ShortcutInput";
import {
  dragMouseButtonOptions,
  type GlobalShortcutKey,
  globalShortcutKeys,
  type ShortcutKey,
  shortcutItems,
  wheelResizeModifierOptions,
} from "@/components/settings/shared";
import { cn } from "@/lib/utils";
import type { Settings } from "@/stores/settings";
import type { SettingsPatch } from "@/stores/settingsStore";

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
  const { t } = useTranslation("settings");
  const modifierLabel = (labelKey: string) => t(labelKey);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-md border border-border bg-background/60 p-3">
        <div className="text-xs font-medium text-muted-foreground">{t("shortcuts.keyboard")}</div>
        {shortcutItems.map((item) => (
          <ShortcutInput
            key={item.key}
            label={t(item.labelKey)}
            value={settings.shortcuts[item.key]}
            onChange={(value) => updateShortcut(item.key, value)}
            labelMeta={
              globalShortcutKeys.includes(item.key as GlobalShortcutKey) ? (
                <span
                  title={
                    globalShortcutRegistration[item.key as GlobalShortcutKey] === true
                      ? t("shortcuts.global.registered")
                      : globalShortcutRegistration[item.key as GlobalShortcutKey] === false
                        ? t("shortcuts.global.notRegistered")
                        : t("shortcuts.global.checking")
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
                  {t("shortcuts.global.badge")}
                </span>
              ) : null
            }
          />
        ))}
        <div className="text-xs text-muted-foreground">{t("shortcuts.global.description")}</div>
        {shortcutError && <div className="text-xs text-destructive">{shortcutError}</div>}
      </div>

      <div className="flex flex-col gap-2 rounded-md border border-border bg-background/60 p-3">
        <div className="text-xs font-medium text-muted-foreground">
          {t("shortcuts.wheelResize.label")}
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
              {modifierLabel(option.labelKey)}
            </button>
          ))}
        </div>
        <div className="text-xs text-muted-foreground">
          {t("shortcuts.wheelResize.description", {
            modifier: modifierLabel(activeWheelResizeModifier.labelKey),
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-md border border-border bg-background/60 p-3">
        <div className="text-xs font-medium text-muted-foreground">
          {t("shortcuts.wheelOpacity.label")}
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
              {modifierLabel(option.labelKey)}
            </button>
          ))}
        </div>
        <div className="text-xs text-muted-foreground">
          {t("shortcuts.wheelOpacity.description", {
            modifier: modifierLabel(activeWheelOpacityModifier.labelKey),
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-md border border-border bg-background/60 p-3">
        <div className="text-xs font-medium text-muted-foreground">
          {t("shortcuts.dragButton.label")}
        </div>
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
              {t(option.labelKey)}
            </button>
          ))}
        </div>
        <div className="text-xs text-muted-foreground">
          {t("shortcuts.dragButton.description", {
            button: t(activeDragMouseButton.labelKey),
          })}
        </div>
      </div>

      <div className="flex flex-col gap-1 rounded-md border border-border bg-background/60 p-3">
        <div className="text-xs font-medium text-muted-foreground">
          {t("shortcuts.currentInteractions.label")}
        </div>
        <div className="text-xs text-muted-foreground">
          {t("shortcuts.currentInteractions.resize", {
            modifier: modifierLabel(activeWheelResizeModifier.labelKey),
          })}
        </div>
        <div className="text-xs text-muted-foreground">
          {t("shortcuts.currentInteractions.opacity", {
            modifier: modifierLabel(activeWheelOpacityModifier.labelKey),
          })}
        </div>
        <div className="text-xs text-muted-foreground">
          {t("shortcuts.currentInteractions.alwaysOnTop")}
        </div>
        <div className="text-xs text-muted-foreground">
          {t("shortcuts.currentInteractions.move", { button: t(activeDragMouseButton.labelKey) })}
        </div>
        <div className="text-xs text-muted-foreground">
          {activeDragMouseButton.value === "right"
            ? t("shortcuts.currentInteractions.rightClickWithDrag")
            : t("shortcuts.currentInteractions.rightClick")}
        </div>
      </div>
    </div>
  );
}
