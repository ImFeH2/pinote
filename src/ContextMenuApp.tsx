import { useCallback, useEffect, useMemo, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  emitNoteContextMenuAction,
  listenNoteContextMenuSync,
  type NoteContextMenuAction,
  type NoteContextMenuContext,
} from "@/lib/api";
import { useTheme } from "@/hooks/useTheme";

function ContextMenuApp({
  targetWindowLabel,
  noteId,
  noteOpacityPercent,
  alwaysOnTop,
}: NoteContextMenuContext) {
  useTheme();
  const menuWindow = useMemo(() => getCurrentWindow(), []);
  const [context, setContext] = useState<NoteContextMenuContext>({
    targetWindowLabel,
    noteId,
    noteOpacityPercent,
    alwaysOnTop,
  });

  const closeMenu = useCallback(() => {
    menuWindow.hide().catch(() => {});
  }, [menuWindow]);

  const dispatchAction = useCallback(
    (action: NoteContextMenuAction) => {
      emitNoteContextMenuAction(context.targetWindowLabel, action)
        .catch((error) => {
          console.error("Failed to emit context menu action:", error);
        })
        .finally(() => {
          closeMenu();
        });
    },
    [closeMenu, context.targetWindowLabel],
  );

  useEffect(() => {
    let unlistenFocusChanged: (() => void) | null = null;

    menuWindow
      .onFocusChanged(({ payload }) => {
        if (payload) return;
        closeMenu();
      })
      .then((unlisten) => {
        unlistenFocusChanged = unlisten;
      })
      .catch((error) => {
        console.error("Failed to subscribe context menu focus listener:", error);
      });

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeMenu();
    };

    const suppressNativeMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    window.addEventListener("keydown", handleEscape, true);
    window.addEventListener("contextmenu", suppressNativeMenu, true);
    return () => {
      window.removeEventListener("keydown", handleEscape, true);
      window.removeEventListener("contextmenu", suppressNativeMenu, true);
      if (unlistenFocusChanged) {
        unlistenFocusChanged();
      }
    };
  }, [closeMenu, menuWindow]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    listenNoteContextMenuSync((nextContext) => {
      setContext(nextContext);
    })
      .then((handler) => {
        unlisten = handler;
      })
      .catch((error) => {
        console.error("Failed to subscribe context menu sync listener:", error);
      });
    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  const title = `Pinote - ${context.noteId} (${context.noteOpacityPercent}%)`;

  return (
    <div className="h-screen w-screen p-0.5">
      <div className="pinote-scrollbar h-full overflow-y-auto rounded-md border border-border bg-background/95 p-1 shadow-xl backdrop-blur-sm">
        <div className="truncate px-2 py-1 text-[11px] font-medium text-muted-foreground">
          {title}
        </div>
        <div className="my-1 h-px bg-border" />
        <button
          type="button"
          onClick={() => {
            dispatchAction("new-note");
          }}
          className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          New Note
        </button>
        <button
          type="button"
          onClick={() => {
            dispatchAction("open-settings");
          }}
          className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          Open Settings
        </button>
        <button
          type="button"
          onClick={() => {
            dispatchAction("increase-opacity");
          }}
          className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          Increase Opacity
        </button>
        <button
          type="button"
          onClick={() => {
            dispatchAction("decrease-opacity");
          }}
          className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          Decrease Opacity
        </button>
        <button
          type="button"
          onClick={() => {
            dispatchAction("reset-opacity");
          }}
          className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          Reset Opacity
        </button>
        <button
          type="button"
          onClick={() => {
            dispatchAction("toggle-always-on-top");
          }}
          className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          {context.alwaysOnTop ? "Disable Always On Top" : "Enable Always On Top"}
        </button>
        <button
          type="button"
          onClick={() => {
            dispatchAction("minimize-window");
          }}
          className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          Minimize Window
        </button>
        <button
          type="button"
          onClick={() => {
            dispatchAction("toggle-maximize");
          }}
          className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          Toggle Maximize
        </button>
        <button
          type="button"
          onClick={() => {
            dispatchAction("hide-window");
          }}
          className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          Hide Window
        </button>
        <button
          type="button"
          onClick={() => {
            dispatchAction("close-window");
          }}
          className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          Close Window
        </button>
      </div>
    </div>
  );
}

export default ContextMenuApp;
