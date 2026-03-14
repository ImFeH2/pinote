import { cn } from "@/lib/utils";
import { sections, type SettingsSection } from "@/components/settings/shared";

interface SettingsSidebarProps {
  activeSection: SettingsSection;
  onSelect: (section: SettingsSection) => void;
}

export function SettingsSidebar({ activeSection, onSelect }: SettingsSidebarProps) {
  return (
    <aside className="flex w-48 shrink-0 flex-col border-r border-border bg-background/60 p-2">
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
          {section.label}
        </button>
      ))}
    </aside>
  );
}
