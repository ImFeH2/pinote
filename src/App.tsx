import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { register, unregister } from "@tauri-apps/plugin-global-shortcut";
import { Pin } from "lucide-react";
import { Editor } from "@/components/Editor";
import { cn } from "@/lib/utils";
import { useTheme } from "@/hooks/useTheme";
import { useAutoSave } from "@/hooks/useAutoSave";
import { useWindowControl } from "@/hooks/useWindowControl";
import { useSettings } from "@/hooks/useSettings";
import { openNoteWindow, openSettingsWindow } from "@/lib/api";
import { buildGeneratedNoteId, DEFAULT_NOTE_ID } from "@/lib/notes";
import { shortcutMatchesEvent } from "@/lib/shortcuts";
import { type WheelResizeModifier } from "@/stores/settings";
import "@/styles/App.css";

const WINDOW_MIN_WIDTH = 320;
const WINDOW_MIN_HEIGHT = 420;
const WINDOW_MAX_WIDTH = 1920;
const WINDOW_MAX_HEIGHT = 2160;
const WINDOW_RESIZE_WIDTH_STEP = 24;
const WINDOW_RESIZE_HEIGHT_STEP = 30;
const CONTEXT_MENU_WIDTH = 224;
const CONTEXT_MENU_HEIGHT = 420;
const CONTEXT_MENU_GAP = 8;
const NOTE_OPACITY_MIN = 0.3;
const NOTE_OPACITY_MAX = 1;
const NOTE_OPACITY_STEP = 0.05;

interface ContextMenuState {
  x: number;
  y: number;
}

interface MiddleDragState {
  pointerStartX: number;
  pointerStartY: number;
  pointerCurrentX: number;
  pointerCurrentY: number;
  windowStartX: number;
  windowStartY: number;
  scaleFactor: number;
  moved: boolean;
  ready: boolean;
}

function resolveEditorFontFamily(value: "system" | "serif" | "mono") {
  if (value === "serif") {
    return 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif';
  }
  if (value === "mono") {
    return '"JetBrains Mono", "Fira Code", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
  }
  return "system-ui, -apple-system, sans-serif";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function wheelModifierMatchesEvent(
  event: ReactWheelEvent<HTMLDivElement>,
  modifier: WheelResizeModifier,
) {
  if (modifier === "alt") {
    return event.altKey && !event.ctrlKey && !event.shiftKey && !event.metaKey;
  }
  if (modifier === "ctrl") {
    return event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey;
  }
  if (modifier === "shift") {
    return event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey;
  }
  return event.metaKey && !event.altKey && !event.ctrlKey && !event.shiftKey;
}

function App({ noteId }: { noteId: string }) {
  const { toggleTheme } = useTheme();
  const { save, load } = useAutoSave(noteId);
  const { alwaysOnTop, toggleAlwaysOnTop, hideWindow } = useWindowControl(noteId);
  const { settings, updateSettings } = useSettings();
  const [initialContent, setInitialContent] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const hasAppliedShortcutUpdate = useRef(false);
  const activeToggleShortcut = useRef(settings.shortcuts.toggleWindow);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const wheelResizeLock = useRef(false);
  const middleDragState = useRef<MiddleDragState | null>(null);
  const middleDragPendingPosition = useRef<{ x: number; y: number } | null>(null);
  const middleDragLastPosition = useRef<{ x: number; y: number } | null>(null);
  const middleDragFrame = useRef<number | null>(null);
  const isMainWindow = getCurrentWindow().label === "main";

  useEffect(() => {
    load().then((content) => {
      setInitialContent(content);
    });
  }, [load]);

  const handleChange = useCallback(
    (markdown: string) => {
      save(markdown);
    },
    [save],
  );

  const openSettings = useCallback(() => {
    openSettingsWindow().catch((error) => {
      console.error("Failed to open settings window:", error);
    });
  }, []);

  const openNote = useCallback(() => {
    const targetNoteId = buildGeneratedNoteId();
    openNoteWindow(targetNoteId).catch((error) => {
      console.error("Failed to open note window:", error);
    });
  }, []);

  const minimizeWindow = useCallback(() => {
    getCurrentWindow()
      .minimize()
      .catch((error) => {
        console.error("Failed to minimize window:", error);
      });
  }, []);

  const toggleMaximizeWindow = useCallback(() => {
    const appWindow = getCurrentWindow();
    appWindow
      .isMaximized()
      .then((maximized) => {
        if (maximized) {
          return appWindow.unmaximize();
        }
        return appWindow.maximize();
      })
      .catch((error) => {
        console.error("Failed to toggle maximize window:", error);
      });
  }, []);

  const closeWindow = useCallback(() => {
    getCurrentWindow()
      .close()
      .catch((error) => {
        console.error("Failed to close window:", error);
      });
  }, []);

  const startWindowDrag = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    getCurrentWindow()
      .startDragging()
      .catch((error) => {
        console.error("Failed to start dragging window:", error);
      });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const applyMiddleDragPosition = useCallback(() => {
    middleDragFrame.current = null;
    const target = middleDragPendingPosition.current;
    if (!target) return;
    const last = middleDragLastPosition.current;
    if (last && last.x === target.x && last.y === target.y) return;
    middleDragLastPosition.current = target;
    getCurrentWindow()
      .setPosition(new PhysicalPosition(target.x, target.y))
      .catch((error) => {
        console.error("Failed to move window by middle drag:", error);
      });
  }, []);

  const scheduleMiddleDragPosition = useCallback(() => {
    if (middleDragFrame.current !== null) return;
    middleDragFrame.current = window.requestAnimationFrame(() => {
      applyMiddleDragPosition();
    });
  }, [applyMiddleDragPosition]);

  const openContextMenu = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const x = clamp(
      event.clientX,
      CONTEXT_MENU_GAP,
      window.innerWidth - CONTEXT_MENU_WIDTH - CONTEXT_MENU_GAP,
    );
    const y = clamp(
      event.clientY,
      CONTEXT_MENU_GAP,
      window.innerHeight - CONTEXT_MENU_HEIGHT - CONTEXT_MENU_GAP,
    );
    setContextMenu({ x, y });
  }, []);

  useEffect(() => {
    const handleMiddleAuxClick = (event: MouseEvent) => {
      if (event.button !== 1) return;
      event.preventDefault();
    };

    const handleMiddleMouseDown = (event: MouseEvent) => {
      if (event.button !== 1) return;
      event.preventDefault();
      closeContextMenu();
      const nextState: MiddleDragState = {
        pointerStartX: event.screenX,
        pointerStartY: event.screenY,
        pointerCurrentX: event.screenX,
        pointerCurrentY: event.screenY,
        windowStartX: 0,
        windowStartY: 0,
        scaleFactor: 1,
        moved: false,
        ready: false,
      };
      middleDragState.current = nextState;
      middleDragPendingPosition.current = null;
      middleDragLastPosition.current = null;
      const appWindow = getCurrentWindow();
      Promise.all([appWindow.outerPosition(), appWindow.scaleFactor()])
        .then(([position, scaleFactor]) => {
          const state = middleDragState.current;
          if (!state) return;
          if (state !== nextState) return;
          state.windowStartX = position.x;
          state.windowStartY = position.y;
          state.scaleFactor = scaleFactor;
          state.ready = true;
          const deltaX = state.pointerCurrentX - state.pointerStartX;
          const deltaY = state.pointerCurrentY - state.pointerStartY;
          if (deltaX === 0 && deltaY === 0) return;
          middleDragPendingPosition.current = {
            x: state.windowStartX + Math.round(deltaX * state.scaleFactor),
            y: state.windowStartY + Math.round(deltaY * state.scaleFactor),
          };
          scheduleMiddleDragPosition();
        })
        .catch((error) => {
          console.error("Failed to prepare middle drag state:", error);
        });
    };

    window.addEventListener("auxclick", handleMiddleAuxClick, true);
    window.addEventListener("mousedown", handleMiddleMouseDown, true);
    return () => {
      window.removeEventListener("auxclick", handleMiddleAuxClick, true);
      window.removeEventListener("mousedown", handleMiddleMouseDown, true);
    };
  }, [closeContextMenu, scheduleMiddleDragPosition]);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const state = middleDragState.current;
      if (!state) return;
      state.pointerCurrentX = event.screenX;
      state.pointerCurrentY = event.screenY;
      const deltaX = state.pointerCurrentX - state.pointerStartX;
      const deltaY = state.pointerCurrentY - state.pointerStartY;
      if (deltaX === 0 && deltaY === 0) return;
      if (!state.moved && Math.abs(deltaX) + Math.abs(deltaY) >= 3) {
        state.moved = true;
      }
      if (!state.ready) return;
      middleDragPendingPosition.current = {
        x: state.windowStartX + Math.round(deltaX * state.scaleFactor),
        y: state.windowStartY + Math.round(deltaY * state.scaleFactor),
      };
      scheduleMiddleDragPosition();
    };

    const finishMiddleInteraction = (shouldToggleAlwaysOnTop: boolean) => {
      const state = middleDragState.current;
      middleDragState.current = null;
      middleDragPendingPosition.current = null;
      middleDragLastPosition.current = null;
      if (middleDragFrame.current !== null) {
        window.cancelAnimationFrame(middleDragFrame.current);
        middleDragFrame.current = null;
      }
      if (!state) return;
      if (shouldToggleAlwaysOnTop && !state.moved) {
        toggleAlwaysOnTop();
      }
    };

    const handleMouseUp = (event: MouseEvent) => {
      if (event.button !== 1) return;
      finishMiddleInteraction(true);
    };

    const handleBlur = () => {
      finishMiddleInteraction(false);
    };

    window.addEventListener("mousemove", handleMouseMove, true);
    window.addEventListener("mouseup", handleMouseUp, true);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove, true);
      window.removeEventListener("mouseup", handleMouseUp, true);
      window.removeEventListener("blur", handleBlur);
    };
  }, [scheduleMiddleDragPosition, toggleAlwaysOnTop]);

  const resizeWindowByWheel = useCallback(
    async (deltaY: number, anchorX: number, anchorY: number) => {
      if (deltaY === 0 || wheelResizeLock.current) return;

      wheelResizeLock.current = true;
      try {
        const direction = deltaY < 0 ? 1 : -1;
        const appWindow = getCurrentWindow();
        const [size, position] = await Promise.all([
          appWindow.innerSize(),
          appWindow.outerPosition(),
        ]);
        const width = clamp(
          size.width + WINDOW_RESIZE_WIDTH_STEP * direction,
          WINDOW_MIN_WIDTH,
          WINDOW_MAX_WIDTH,
        );
        const height = clamp(
          size.height + WINDOW_RESIZE_HEIGHT_STEP * direction,
          WINDOW_MIN_HEIGHT,
          WINDOW_MAX_HEIGHT,
        );
        if (width === size.width && height === size.height) return;
        const viewportWidth = Math.max(window.innerWidth, 1);
        const viewportHeight = Math.max(window.innerHeight, 1);
        const anchorRatioX = clamp(anchorX / viewportWidth, 0, 1);
        const anchorRatioY = clamp(anchorY / viewportHeight, 0, 1);
        const nextX = Math.round(position.x + (size.width - width) * anchorRatioX);
        const nextY = Math.round(position.y + (size.height - height) * anchorRatioY);
        await appWindow.setSize(new PhysicalSize(width, height));
        await appWindow.setPosition(new PhysicalPosition(nextX, nextY));
      } catch (error) {
        console.error("Failed to resize window by wheel:", error);
      } finally {
        window.setTimeout(() => {
          wheelResizeLock.current = false;
        }, 16);
      }
    },
    [],
  );

  const handleWindowWheel = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      if (!wheelModifierMatchesEvent(event, settings.wheelResizeModifier)) return;
      event.preventDefault();
      closeContextMenu();
      void resizeWindowByWheel(event.deltaY, event.clientX, event.clientY);
    },
    [closeContextMenu, resizeWindowByWheel, settings.wheelResizeModifier],
  );

  const toggleWindowVisibilityByShortcut = useCallback(async () => {
    const appWindow = getCurrentWindow();
    try {
      const visible = await appWindow.isVisible();
      if (visible) {
        await appWindow.hide();
        return;
      }
      await appWindow.show();
      await appWindow.setFocus();
    } catch (error) {
      console.error("Failed to toggle window visibility:", error);
    }
  }, []);

  useEffect(() => {
    if (!isMainWindow) return;

    if (!hasAppliedShortcutUpdate.current) {
      hasAppliedShortcutUpdate.current = true;
      activeToggleShortcut.current = settings.shortcuts.toggleWindow;
      return;
    }

    const previousShortcut = activeToggleShortcut.current;
    const nextShortcut = settings.shortcuts.toggleWindow;
    if (previousShortcut === nextShortcut) return;

    let disposed = false;
    const updateShortcutRegistration = async () => {
      try {
        await register(nextShortcut, (event) => {
          if (event.state !== "Pressed") return;
          void toggleWindowVisibilityByShortcut();
        });
        if (disposed) {
          await unregister(nextShortcut).catch(() => {});
          return;
        }
        await unregister(previousShortcut).catch(() => {});
        activeToggleShortcut.current = nextShortcut;
      } catch (error) {
        console.error(`Failed to update global shortcut ${nextShortcut}:`, error);
      }
    };

    void updateShortcutRegistration();
    return () => {
      disposed = true;
    };
  }, [isMainWindow, settings.shortcuts.toggleWindow, toggleWindowVisibilityByShortcut]);

  useEffect(() => {
    if (settings.wheelResizeModifier !== "alt") return;

    const suppressBareAlt = (event: KeyboardEvent) => {
      if (event.key !== "Alt") return;
      if (event.ctrlKey || event.shiftKey || event.metaKey) return;
      event.preventDefault();
    };

    window.addEventListener("keydown", suppressBareAlt, true);
    window.addEventListener("keyup", suppressBareAlt, true);
    return () => {
      window.removeEventListener("keydown", suppressBareAlt, true);
      window.removeEventListener("keyup", suppressBareAlt, true);
    };
  }, [settings.wheelResizeModifier]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (shortcutMatchesEvent(settings.shortcuts.hideWindow, e)) {
        e.preventDefault();
        hideWindow();
        return;
      }
      if (shortcutMatchesEvent(settings.shortcuts.toggleAlwaysOnTop, e)) {
        e.preventDefault();
        toggleAlwaysOnTop();
        return;
      }
      if (shortcutMatchesEvent(settings.shortcuts.toggleTheme, e)) {
        e.preventDefault();
        toggleTheme();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    hideWindow,
    settings.shortcuts.hideWindow,
    settings.shortcuts.toggleAlwaysOnTop,
    settings.shortcuts.toggleTheme,
    toggleAlwaysOnTop,
    toggleTheme,
  ]);

  useEffect(() => {
    if (!contextMenu) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!contextMenuRef.current) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (contextMenuRef.current.contains(target)) return;
      setContextMenu(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setContextMenu(null);
      }
    };

    const handleBlur = () => {
      setContextMenu(null);
    };

    window.addEventListener("mousedown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("blur", handleBlur);
    };
  }, [contextMenu]);

  const title = noteId === DEFAULT_NOTE_ID ? "Pinote" : `Pinote - ${noteId}`;
  const noteOpacity = settings.noteOpacity[noteId] ?? 1;
  const noteOpacityPercent = Math.round(noteOpacity * 100);

  const setNoteOpacity = useCallback(
    (value: number) => {
      updateSettings({
        noteOpacity: {
          [noteId]: clamp(value, NOTE_OPACITY_MIN, NOTE_OPACITY_MAX),
        },
      });
    },
    [noteId, updateSettings],
  );

  const increaseNoteOpacity = useCallback(() => {
    setNoteOpacity(noteOpacity + NOTE_OPACITY_STEP);
  }, [noteOpacity, setNoteOpacity]);

  const decreaseNoteOpacity = useCallback(() => {
    setNoteOpacity(noteOpacity - NOTE_OPACITY_STEP);
  }, [noteOpacity, setNoteOpacity]);

  const resetNoteOpacity = useCallback(() => {
    setNoteOpacity(1);
  }, [setNoteOpacity]);

  const editorStyle = useMemo(
    () =>
      ({
        "--editor-font-family": resolveEditorFontFamily(settings.editorFontFamily),
        "--editor-font-size": `${settings.editorFontSize}px`,
        "--editor-line-height": settings.editorLineHeight.toString(),
        "--editor-padding-x": `${settings.editorPaddingX}px`,
        "--editor-padding-y": `${settings.editorPaddingY}px`,
      }) as CSSProperties,
    [
      settings.editorFontFamily,
      settings.editorFontSize,
      settings.editorLineHeight,
      settings.editorPaddingX,
      settings.editorPaddingY,
    ],
  );

  if (initialContent === null) {
    return (
      <div className="flex h-screen items-center justify-center rounded-lg bg-background">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div
      data-pinned={alwaysOnTop ? "true" : "false"}
      className="pinote-window relative flex h-screen flex-col overflow-hidden rounded-lg"
      onContextMenu={openContextMenu}
      onWheelCapture={handleWindowWheel}
    >
      <div className="absolute inset-0 bg-background" style={{ opacity: noteOpacity }} />
      <div
        onMouseDown={startWindowDrag}
        className="absolute left-0 right-0 top-0 z-20 h-1.5 cursor-grab"
      />
      <div
        className={cn(
          "pinote-pinned-badge pointer-events-none absolute right-3 top-3 z-30 flex h-5 w-5 items-center justify-center rounded-full transition-all duration-200",
          alwaysOnTop ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0",
        )}
      >
        <Pin size={11} />
      </div>
      <div className="relative flex flex-1 flex-col overflow-hidden">
        <Editor defaultValue={initialContent} onChange={handleChange} style={editorStyle} />
      </div>
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="absolute z-50 w-56 rounded-md border border-border bg-background/95 p-1 shadow-xl backdrop-blur-sm"
          style={{
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
          }}
        >
          <div className="truncate px-2 py-1 text-[11px] font-medium text-muted-foreground">
            {`${title} (${noteOpacityPercent}%)`}
          </div>
          <div className="my-1 h-px bg-border" />
          <button
            type="button"
            onClick={() => {
              closeContextMenu();
              openNote();
            }}
            className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            New Note
          </button>
          <button
            type="button"
            onClick={() => {
              closeContextMenu();
              openSettings();
            }}
            className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Open Settings
          </button>
          <button
            type="button"
            onClick={() => {
              closeContextMenu();
              increaseNoteOpacity();
            }}
            className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Increase Opacity
          </button>
          <button
            type="button"
            onClick={() => {
              closeContextMenu();
              decreaseNoteOpacity();
            }}
            className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Decrease Opacity
          </button>
          <button
            type="button"
            onClick={() => {
              closeContextMenu();
              resetNoteOpacity();
            }}
            className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Reset Opacity
          </button>
          <button
            type="button"
            onClick={() => {
              closeContextMenu();
              toggleAlwaysOnTop();
            }}
            className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            {alwaysOnTop ? "Disable Always On Top" : "Enable Always On Top"}
          </button>
          <button
            type="button"
            onClick={() => {
              closeContextMenu();
              minimizeWindow();
            }}
            className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Minimize Window
          </button>
          <button
            type="button"
            onClick={() => {
              closeContextMenu();
              toggleMaximizeWindow();
            }}
            className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Toggle Maximize
          </button>
          <button
            type="button"
            onClick={() => {
              closeContextMenu();
              hideWindow();
            }}
            className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Hide Window
          </button>
          <button
            type="button"
            onClick={() => {
              closeContextMenu();
              closeWindow();
            }}
            className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Close Window
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
