import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWindow, monitorFromPoint } from "@tauri-apps/api/window";
import {
  emitNoteContextMenuAction,
  listenNoteContextMenuSync,
  type NoteContextMenuAction,
  type NoteContextMenuContext,
} from "@/lib/api";
import { useTheme } from "@/hooks/useTheme";

const MENU_EDGE_GAP = 8;
const MENU_MAX_WIDTH = 360;
const MENU_MIN_HEIGHT = 96;
const MENU_MAX_HEIGHT = 640;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function parsePx(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function ContextMenuApp({ targetWindowLabel, noteId, anchorX, anchorY }: NoteContextMenuContext) {
  useTheme();
  const menuWindow = useMemo(() => getCurrentWindow(), []);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const actionsRef = useRef<HTMLDivElement | null>(null);
  const [context, setContext] = useState<NoteContextMenuContext>({
    targetWindowLabel,
    noteId,
    anchorX,
    anchorY,
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

  const title = `Pinote - ${context.noteId}`;

  const fitWindowToContent = useCallback(() => {
    const shell = shellRef.current;
    const panel = panelRef.current;
    const actions = actionsRef.current;
    if (!shell || !panel || !actions) return;
    const shellStyles = window.getComputedStyle(shell);
    const panelStyles = window.getComputedStyle(panel);
    const shellPaddingX = parsePx(shellStyles.paddingLeft) + parsePx(shellStyles.paddingRight);
    const panelPaddingX =
      parsePx(panelStyles.paddingLeft) +
      parsePx(panelStyles.paddingRight) +
      parsePx(panelStyles.borderLeftWidth) +
      parsePx(panelStyles.borderRightWidth);
    const actionsRect = actions.getBoundingClientRect();
    const shellRect = shell.getBoundingClientRect();
    const widthCss = clamp(
      Math.ceil(actionsRect.width + shellPaddingX + panelPaddingX),
      1,
      MENU_MAX_WIDTH,
    );
    const heightCss = clamp(Math.ceil(shellRect.height), MENU_MIN_HEIGHT, MENU_MAX_HEIGHT);
    void Promise.all([menuWindow.scaleFactor(), menuWindow.innerSize()])
      .then(async ([scaleFactor, size]) => {
        const factor = Number.isFinite(scaleFactor) && scaleFactor > 0 ? scaleFactor : 1;
        const width = Math.max(1, Math.round(widthCss * factor));
        const height = Math.max(1, Math.round(heightCss * factor));
        const pointerX = context.anchorX;
        const pointerY = context.anchorY;
        let nextX = pointerX;
        let nextY = pointerY;
        const monitor = await monitorFromPoint(pointerX, pointerY).catch(() => null);
        if (monitor) {
          const minX = monitor.workArea.position.x + MENU_EDGE_GAP;
          const minY = monitor.workArea.position.y + MENU_EDGE_GAP;
          const maxX = Math.max(
            minX,
            monitor.workArea.position.x + monitor.workArea.size.width - width - MENU_EDGE_GAP,
          );
          const maxY = Math.max(
            minY,
            monitor.workArea.position.y + monitor.workArea.size.height - height - MENU_EDGE_GAP,
          );
          const rightSpace =
            monitor.workArea.position.x + monitor.workArea.size.width - pointerX - MENU_EDGE_GAP;
          const leftSpace = pointerX - monitor.workArea.position.x - MENU_EDGE_GAP;
          const bottomSpace =
            monitor.workArea.position.y + monitor.workArea.size.height - pointerY - MENU_EDGE_GAP;
          const topSpace = pointerY - monitor.workArea.position.y - MENU_EDGE_GAP;
          if (rightSpace < width && leftSpace >= width) {
            nextX = pointerX - width;
          }
          if (bottomSpace < height && topSpace >= height) {
            nextY = pointerY - height;
          }
          nextX = clamp(nextX, minX, maxX);
          nextY = clamp(nextY, minY, maxY);
        }
        const position = await menuWindow.outerPosition().catch(() => null);
        if (!position) {
          await menuWindow.setSize(new PhysicalSize(width, height));
          await menuWindow.setPosition(new PhysicalPosition(nextX, nextY));
          return;
        }
        if (
          size.width === width &&
          size.height === height &&
          nextX === position.x &&
          nextY === position.y
        ) {
          return;
        }
        await menuWindow.setSize(new PhysicalSize(width, height));
        await menuWindow.setPosition(new PhysicalPosition(nextX, nextY));
      })
      .catch((error) => {
        console.error("Failed to fit context menu window:", error);
      });
  }, [context.anchorX, context.anchorY, menuWindow]);

  useLayoutEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      fitWindowToContent();
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [context, fitWindowToContent]);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    if (typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(() => {
      fitWindowToContent();
    });
    observer.observe(shell);
    return () => {
      observer.disconnect();
    };
  }, [fitWindowToContent]);

  return (
    <div ref={shellRef} className="inline-block">
      <div ref={panelRef} className="pinote-scrollbar overflow-y-auto bg-background p-1">
        <div className="truncate px-2 py-1 text-[11px] font-medium text-muted-foreground">
          {title}
        </div>
        <div className="my-1 h-px bg-border" />
        <div ref={actionsRef} className="inline-flex w-max flex-col">
          <button
            type="button"
            onClick={() => {
              dispatchAction("new-note");
            }}
            className="flex items-center whitespace-nowrap rounded px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            New Note
          </button>
          <button
            type="button"
            onClick={() => {
              dispatchAction("open-settings");
            }}
            className="flex items-center whitespace-nowrap rounded px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Open Settings
          </button>
          <button
            type="button"
            onClick={() => {
              dispatchAction("minimize-window");
            }}
            className="flex items-center whitespace-nowrap rounded px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Minimize Window
          </button>
          <button
            type="button"
            onClick={() => {
              dispatchAction("toggle-maximize");
            }}
            className="flex items-center whitespace-nowrap rounded px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Toggle Maximize
          </button>
          <button
            type="button"
            onClick={() => {
              dispatchAction("hide-window");
            }}
            className="flex items-center whitespace-nowrap rounded px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Hide Window
          </button>
          <button
            type="button"
            onClick={() => {
              dispatchAction("close-window");
            }}
            className="flex items-center whitespace-nowrap rounded px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Close Window
          </button>
        </div>
      </div>
    </div>
  );
}

export default ContextMenuApp;
