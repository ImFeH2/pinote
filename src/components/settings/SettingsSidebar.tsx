import { useTranslation } from "react-i18next";
import { type SettingsSection, sections } from "@/components/settings/shared";
import { cn } from "@/lib/utils";

interface SettingsSidebarProps {
  activeSection: SettingsSection;
  appVersion: string | null;
  onSelect: (section: SettingsSection) => void;
}

export function SettingsSidebar({ activeSection, appVersion, onSelect }: SettingsSidebarProps) {
  const { t } = useTranslation("settings");
  const versionText = appVersion === null ? "…" : appVersion ? `v${appVersion}` : "—";
  return (
    <aside className="flex w-48 shrink-0 flex-col border-r border-border bg-background/60 p-2">
      <div className="mb-2 flex items-center gap-2.5 border-b border-border px-2 pb-3 pt-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-background shadow-sm">
          <img src="/favicon.ico" alt="" className="h-8 w-8" />
        </div>
        <div className="min-w-0 select-none">
          <div className="truncate text-sm font-semibold tracking-tight text-foreground">
            Pinote
          </div>
          <div className="mt-0.5 text-[10px] tabular-nums text-muted-foreground">{versionText}</div>
        </div>
      </div>
      {sections.map((section) => (
        <button
          key={section.id}
          type="button"
          onClick={() => onSelect(section.id)}
          className={cn(
            "mb-1 rounded-md px-3 py-2 text-left text-xs font-medium transition-colors",
            activeSection === section.id
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          )}
        >
          {t(section.labelKey)}
        </button>
      ))}
    </aside>
  );
}
