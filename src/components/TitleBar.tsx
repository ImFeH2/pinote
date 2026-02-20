import { useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Settings2, Minus, Square, X } from "lucide-react";

interface TitleBarProps {
  title: string;
  showSettings: boolean;
  onOpenSettings?: () => void;
}

export function TitleBar({ title, showSettings, onOpenSettings }: TitleBarProps) {
  const appWindow = getCurrentWindow();

  const handleMinimize = useCallback(() => {
    appWindow.minimize().catch(() => {});
  }, [appWindow]);

  const handleToggleMaximize = useCallback(() => {
    appWindow
      .isMaximized()
      .then((maximized) => {
        if (maximized) {
          return appWindow.unmaximize();
        }
        return appWindow.maximize();
      })
      .catch(() => {});
  }, [appWindow]);

  const handleClose = useCallback(() => {
    appWindow.close().catch(() => {});
  }, [appWindow]);

  return (
    <div className="flex h-9 shrink-0 items-center justify-between border-b border-border bg-background/80 px-2 backdrop-blur-sm">
      <div data-tauri-drag-region className="flex flex-1 select-none items-center pl-1">
        <span data-tauri-drag-region className="text-xs font-medium text-muted-foreground">
          {title}
        </span>
      </div>

      <div className="flex items-center gap-0.5">
        {showSettings && (
          <button
            onClick={onOpenSettings}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <Settings2 size={13} />
          </button>
        )}

        <button
          onClick={handleMinimize}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <Minus size={13} />
        </button>

        <button
          onClick={handleToggleMaximize}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <Square size={12} />
        </button>

        <button
          onClick={handleClose}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive hover:text-white"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}
