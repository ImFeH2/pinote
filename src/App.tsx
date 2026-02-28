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
import { PhysicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { register, unregister } from "@tauri-apps/plugin-global-shortcut";
import { Editor } from "@/components/Editor";
import { TitleBar } from "@/components/TitleBar";
import { useTheme } from "@/hooks/useTheme";
import { useAutoSave } from "@/hooks/useAutoSave";
import { useWindowControl } from "@/hooks/useWindowControl";
import { useSettings } from "@/hooks/useSettings";
import { openNoteWindow, openSettingsWindow } from "@/lib/api";
import { buildGeneratedNoteId, DEFAULT_NOTE_ID } from "@/lib/notes";
import { shortcutMatchesEvent } from "@/lib/shortcuts";
import "@/styles/App.css";

const WINDOW_MIN_WIDTH = 320;
const WINDOW_MIN_HEIGHT = 420;
const WINDOW_MAX_WIDTH = 1920;
const WINDOW_MAX_HEIGHT = 2160;
const WINDOW_RESIZE_WIDTH_STEP = 24;
const WINDOW_RESIZE_HEIGHT_STEP = 30;
const CONTEXT_MENU_WIDTH = 224;
const CONTEXT_MENU_HEIGHT = 220;
const CONTEXT_MENU_GAP = 8;

interface ContextMenuState {
  x: number;
  y: number;
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

function App({ noteId }: { noteId: string }) {
  const { toggleTheme } = useTheme();
  const { save, load } = useAutoSave(noteId);
  const { toggleAlwaysOnTop, hideWindow } = useWindowControl();
  const { settings } = useSettings();
  const [initialContent, setInitialContent] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const hasAppliedShortcutUpdate = useRef(false);
  const activeToggleShortcut = useRef(settings.shortcuts.toggleWindow);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const wheelResizeLock = useRef(false);
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
    const value = window.prompt("Open note ID (leave blank to create a new note)", "");
    if (value === null) return;
    const targetNoteId = value.trim().length > 0 ? value : buildGeneratedNoteId();
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

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

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

  const handleMiddleClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (event.button !== 1) return;
      event.preventDefault();
      closeContextMenu();
      toggleAlwaysOnTop();
    },
    [closeContextMenu, toggleAlwaysOnTop],
  );

  const resizeWindowByWheel = useCallback(async (deltaY: number) => {
    if (deltaY === 0 || wheelResizeLock.current) return;

    wheelResizeLock.current = true;
    try {
      const direction = deltaY < 0 ? 1 : -1;
      const appWindow = getCurrentWindow();
      const size = await appWindow.innerSize();
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
      await appWindow.setSize(new PhysicalSize(width, height));
    } catch (error) {
      console.error("Failed to resize window by wheel:", error);
    } finally {
      window.setTimeout(() => {
        wheelResizeLock.current = false;
      }, 16);
    }
  }, []);

  const handleTitleBarWheel = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      event.preventDefault();
      void resizeWindowByWheel(event.deltaY);
    },
    [resizeWindowByWheel],
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
      <div className="flex h-screen items-center justify-center rounded-lg bg-background shadow-lg">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div
      className="relative flex h-screen flex-col overflow-hidden rounded-lg shadow-lg"
      onContextMenu={openContextMenu}
      onMouseDownCapture={handleMiddleClick}
    >
      <div className="absolute inset-0 bg-background" style={{ opacity: settings.opacity }} />
      <div className="relative flex flex-1 flex-col overflow-hidden">
        <TitleBar
          title={title}
          showSettings
          showNewNote
          onOpenSettings={openSettings}
          onOpenNewNote={openNote}
          onWheel={handleTitleBarWheel}
        />
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
              toggleAlwaysOnTop();
            }}
            className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            {settings.alwaysOnTop ? "Disable Always On Top" : "Enable Always On Top"}
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
              hideWindow();
            }}
            className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Hide Window
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
