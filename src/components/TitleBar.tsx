import { Pin, PinOff, X, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

interface TitleBarProps {
  alwaysOnTop: boolean;
  theme: "light" | "dark";
  onToggleAlwaysOnTop: () => void;
  onToggleTheme: () => void;
  onClose: () => void;
}

export function TitleBar({
  alwaysOnTop,
  theme,
  onToggleAlwaysOnTop,
  onToggleTheme,
  onClose,
}: TitleBarProps) {
  return (
    <div
      data-tauri-drag-region
      className="flex h-9 shrink-0 items-center justify-between border-b border-border bg-background/80 px-2 backdrop-blur-sm"
    >
      <div data-tauri-drag-region className="flex-1 select-none pl-1">
        <span data-tauri-drag-region className="text-xs font-medium text-muted-foreground">
          Pinote
        </span>
      </div>

      <div className="flex items-center gap-0.5">
        <button
          onClick={onToggleTheme}
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-md transition-colors",
            "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          )}
        >
          {theme === "dark" ? <Sun size={13} /> : <Moon size={13} />}
        </button>

        <button
          onClick={onToggleAlwaysOnTop}
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-md transition-colors",
            "hover:bg-accent hover:text-accent-foreground",
            alwaysOnTop ? "text-primary" : "text-muted-foreground",
          )}
        >
          {alwaysOnTop ? <Pin size={13} /> : <PinOff size={13} />}
        </button>

        <button
          onClick={onClose}
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-md transition-colors",
            "text-muted-foreground hover:bg-destructive hover:text-white",
          )}
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}
