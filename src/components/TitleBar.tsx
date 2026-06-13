import { getCurrentWindow } from "@tauri-apps/api/window";
import { FilePlus2, Minus, Settings2, Square, X } from "lucide-react";
import { type MouseEvent, useCallback, type WheelEvent } from "react";
import { logError } from "@/lib/logger";

interface TitleBarProps {
  title: string;
  showSettings: boolean;
  showNewNote?: boolean;
  onOpenNewNote?: () => void;
  onOpenSettings?: () => void;
  onWheel?: (event: WheelEvent<HTMLDivElement>) => void;
}

export function TitleBar({
  title,
  showSettings,
  showNewNote = false,
  onOpenNewNote,
  onOpenSettings,
  onWheel,
}: TitleBarProps) {
  const appWindow = getCurrentWindow();

  const handleStartDrag = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      appWindow.startDragging().catch(() => {
        appWindow
          .setFocus()
          .then(() => appWindow.startDragging())
          .catch((error) => {
            logError("title-bar", "start_dragging_failed", error, {
              windowId: appWindow.label,
            });
          });
      });
    },
    [appWindow],
  );

  const handleMinimize = useCallback(() => {
    appWindow.minimize().catch((error) => {
      logError("title-bar", "minimize_failed", error, {
        windowId: appWindow.label,
      });
    });
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
      .catch((error) => {
        logError("title-bar", "toggle_maximize_failed", error, {
          windowId: appWindow.label,
        });
      });
  }, [appWindow]);

  const handleClose = useCallback(() => {
    appWindow.close().catch((error) => {
      logError("title-bar", "close_failed", error, {
        windowId: appWindow.label,
      });
    });
  }, [appWindow]);

  return (
    <div
      onWheel={onWheel}
      className="flex h-9 shrink-0 items-center justify-between border-b border-border bg-background/80 px-2 backdrop-blur-sm"
    >
      <div onMouseDown={handleStartDrag} className="flex flex-1 select-none items-center pl-1">
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
      </div>

      <div className="flex items-center gap-0.5">
        {showNewNote && (
          <button
            type="button"
            onClick={onOpenNewNote}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <FilePlus2 size={13} />
          </button>
        )}

        {showSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <Settings2 size={13} />
          </button>
        )}

        <button
          type="button"
          onClick={handleMinimize}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <Minus size={13} />
        </button>

        <button
          type="button"
          onClick={handleToggleMaximize}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <Square size={12} />
        </button>

        <button
          type="button"
          onClick={handleClose}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive hover:text-white"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}
