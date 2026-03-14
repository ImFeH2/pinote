import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi";
import { Effect, getCurrentWindow, monitorFromPoint } from "@tauri-apps/api/window";
import { dirname } from "@tauri-apps/api/path";
import { readTextFile, watchImmediate } from "@tauri-apps/plugin-fs";
import { Lock, Pin } from "lucide-react";
import { Editor } from "@/components/Editor";
import { useTheme } from "@/hooks/useTheme";
import { useAutoSave } from "@/hooks/useAutoSave";
import { useNoteWindowState } from "@/hooks/useNoteWindowState";
import { useWindowControl } from "@/hooks/useWindowControl";
import { useSettings } from "@/hooks/useSettings";
import {
  closeNoteContextMenu,
  listenNoteContextMenuAction,
  openNoteContextMenu,
  type NoteContextMenuAction,
} from "@/lib/contextMenuApi";
import { getRuntimePlatform, openSettingsWindow, type RuntimePlatform } from "@/lib/windowApi";
import { shortcutMatchesEvent } from "@/lib/shortcuts";
import { openAndTrackNoteWindow } from "@/lib/windowManager";
import { recordOpenedNote } from "@/lib/noteHistory";
import { logDebug, logError } from "@/lib/logger";
import { type WheelResizeModifier, type WindowsGlassEffect } from "@/stores/settings";
import "@/styles/App.css";

const WINDOW_MIN_WIDTH = 1;
const WINDOW_MIN_HEIGHT = 1;
const WINDOW_MAX_WIDTH = 1920;
const WINDOW_MAX_HEIGHT = 2160;
const WINDOW_RESIZE_WIDTH_STEP = 24;
const WINDOW_RESIZE_HEIGHT_STEP = 30;
const NEW_NOTE_POSITION_OFFSET_X = 28;
const NEW_NOTE_POSITION_OFFSET_Y = 28;
const NOTE_OPACITY_MIN = 0;
const NOTE_OPACITY_MAX = 1;
const NOTE_OPACITY_STEP = 0.05;
const EXTERNAL_FILE_RELOAD_DEBOUNCE_MS = 120;
const SELF_FILE_WRITE_IGNORE_MS = 420;

interface MiddleDragState {
  button: number;
  allowMove: boolean;
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

function normalizePathForCompare(value: string) {
  return value.trim().replace(/\//g, "\\").toLowerCase();
}

interface ModifierState {
  altKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

function wheelModifierMatchesEvent(event: ModifierState, modifier: WheelResizeModifier) {
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

function resolveDragMouseButtonCode(button: "middle" | "right") {
  return button === "right" ? 2 : 1;
}

function getWindowsPrimaryEffect(effect: WindowsGlassEffect) {
  if (effect === "mica") return Effect.Mica;
  if (effect === "acrylic") return Effect.Acrylic;
  if (effect === "blur") return Effect.Blur;
  return null;
}

function getWindowsFallbackEffects(effect: WindowsGlassEffect) {
  if (effect === "mica") return [Effect.Acrylic, Effect.Blur];
  if (effect === "acrylic") return [Effect.Blur];
  return [];
}

function App({
  noteId,
  notePath,
  initialOpacity,
}: {
  noteId: string;
  notePath: string;
  initialOpacity?: number;
}) {
  const { toggleTheme } = useTheme();
  const { alwaysOnTop, toggleAlwaysOnTop } = useWindowControl();
  const { settings } = useSettings();
  const appWindow = useMemo(() => getCurrentWindow(), []);
  const windowLabel = appWindow.label;
  const initialWindowOpacity = clamp(initialOpacity ?? 1, NOTE_OPACITY_MIN, NOTE_OPACITY_MAX);
  const [initialContent, setInitialContent] = useState<string | null>(null);
  const [noteOpacity, setNoteOpacityState] = useState(initialWindowOpacity);
  const wheelResizeLock = useRef(false);
  const middleDragState = useRef<MiddleDragState | null>(null);
  const middleDragPendingPosition = useRef<{ x: number; y: number } | null>(null);
  const middleDragLastPosition = useRef<{ x: number; y: number } | null>(null);
  const middleDragFrame = useRef<number | null>(null);
  const suppressNextContextMenu = useRef(false);
  const noteOpacityRef = useRef(initialWindowOpacity);
  const noteReadOnlyRef = useRef(false);
  const scrollPersistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteScrollTopRef = useRef(0);
  const latestEditorContentRef = useRef("");
  const persistedContentRef = useRef("");
  const pendingExternalContentRef = useRef<string | null>(null);
  const ignoreExternalWatchUntilRef = useRef(0);
  const externalReloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressEditorScrollUntilRef = useRef(0);
  const suppressEditorScrollTopRef = useRef(0);
  const closeRequestState = useRef<"idle" | "persisting" | "ready">("idle");
  const forceHiddenVisibilityRef = useRef(false);
  const hideInProgressRef = useRef(false);
  const [runtimePlatform, setRuntimePlatform] = useState<RuntimePlatform>("other");
  const [hasExternalFileChange, setHasExternalFileChange] = useState(false);
  const [editorReloadToken, setEditorReloadToken] = useState(0);
  const [noteReadOnly, setNoteReadOnly] = useState(false);

  const handlePersistedContent = useCallback(
    (content: string, source: "load" | "save") => {
      logDebug("note-window", "external_watch_persisted", {
        source,
        notePath,
        length: content.length,
      });
      persistedContentRef.current = content;
      if (source === "save") {
        ignoreExternalWatchUntilRef.current = Date.now() + SELF_FILE_WRITE_IGNORE_MS;
      }
    },
    [notePath],
  );

  const { save, load, isSavePending } = useAutoSave(notePath, {
    onPersisted: handlePersistedContent,
  });

  useEffect(() => {
    noteOpacityRef.current = noteOpacity;
  }, [noteOpacity]);

  useEffect(() => {
    noteReadOnlyRef.current = noteReadOnly;
  }, [noteReadOnly]);

  useEffect(() => {
    load().then((content) => {
      latestEditorContentRef.current = content;
      persistedContentRef.current = content;
      pendingExternalContentRef.current = null;
      setHasExternalFileChange(false);
      setInitialContent(content);
    });
  }, [load]);

  useEffect(() => {
    void recordOpenedNote({
      notePath,
      noteId,
      windowId: windowLabel,
    }).catch((error) => {
      logError("note-window", "record_note_history_failed_on_mount", error, {
        notePath,
        noteId,
        windowId: windowLabel,
      });
    });
  }, [noteId, notePath, windowLabel]);

  useEffect(() => {
    let disposed = false;
    getRuntimePlatform()
      .then((platform) => {
        if (disposed) return;
        setRuntimePlatform(platform);
      })
      .catch(() => {
        if (disposed) return;
        setRuntimePlatform("other");
      });
    return () => {
      disposed = true;
    };
  }, []);

  const {
    hideWindow,
    handleScrollTopChange,
    initialEditorScrollTop,
    persistWindowState,
    setInitialEditorScrollTop,
  } = useNoteWindowState({
    appWindow,
    alwaysOnTop,
    closeRequestState,
    forceHiddenVisibilityRef,
    hideInProgressRef,
    noteId,
    noteOpacityRef,
    notePath,
    noteReadOnlyRef,
    noteScrollTopRef,
    scrollPersistTimer,
    setNoteOpacityState,
    setNoteReadOnly,
    windowLabel,
  });

  const handleChange = useCallback(
    (markdown: string) => {
      if (noteReadOnlyRef.current) return;
      latestEditorContentRef.current = markdown;
      save(markdown);
    },
    [save],
  );

  const applyExternalFileContent = useCallback(
    (content: string) => {
      logDebug("note-window", "external_watch_apply", {
        notePath,
        length: content.length,
      });
      latestEditorContentRef.current = content;
      persistedContentRef.current = content;
      pendingExternalContentRef.current = null;
      setHasExternalFileChange(false);
      setInitialEditorScrollTop(Math.max(0, noteScrollTopRef.current));
      setInitialContent(content);
      setEditorReloadToken((value) => value + 1);
    },
    [notePath],
  );

  const reloadExternalFileContent = useCallback(() => {
    const pending = pendingExternalContentRef.current;
    if (pending === null) {
      logDebug("note-window", "external_watch_reload_skipped_no_pending", { notePath });
      return;
    }
    logDebug("note-window", "external_watch_reload_manual", {
      notePath,
      length: pending.length,
    });
    applyExternalFileContent(pending);
  }, [applyExternalFileContent, notePath]);

  const dismissExternalFileChange = useCallback(() => {
    logDebug("note-window", "external_watch_ignore", { notePath });
    pendingExternalContentRef.current = null;
    setHasExternalFileChange(false);
  }, [notePath]);

  useEffect(() => {
    const handleScrollCapture = (event: Event) => {
      if (Date.now() > suppressEditorScrollUntilRef.current) return;
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (!target.classList.contains("milkdown-editor")) return;
      const lockedTop = suppressEditorScrollTopRef.current;
      if (Math.abs(target.scrollTop - lockedTop) < 0.5) return;
      target.scrollTop = lockedTop;
    };

    window.addEventListener("scroll", handleScrollCapture, true);
    return () => {
      window.removeEventListener("scroll", handleScrollCapture, true);
    };
  }, []);

  useEffect(() => {
    if (initialContent === null) return;
    let disposed = false;
    let unwatch: (() => void) | null = null;
    const watchedPath = notePath.trim();
    const normalizedWatchedPath = normalizePathForCompare(watchedPath);
    logDebug("note-window", "external_watch_setup_begin", {
      notePath,
      watchedPath,
      normalizedWatchedPath,
    });

    const scheduleReload = () => {
      logDebug("note-window", "external_watch_schedule_reload", { notePath, watchedPath });
      if (externalReloadTimerRef.current) {
        clearTimeout(externalReloadTimerRef.current);
      }
      externalReloadTimerRef.current = setTimeout(() => {
        void (async () => {
          if (disposed) return;
          if (Date.now() < ignoreExternalWatchUntilRef.current) {
            logDebug("note-window", "external_watch_skip_self_write_window", {
              notePath,
              watchedPath,
            });
            return;
          }
          const fileContent = await readTextFile(watchedPath).catch((error) => {
            logError("note-window", "external_watch_read_file_failed", error, {
              notePath,
              watchedPath,
            });
            return null;
          });
          if (disposed) return;
          if (fileContent === null) {
            logDebug("note-window", "external_watch_skip_read_null", { notePath, watchedPath });
            return;
          }
          if (fileContent === latestEditorContentRef.current) {
            logDebug("note-window", "external_watch_skip_same_as_editor", {
              notePath,
              watchedPath,
              length: fileContent.length,
            });
            return;
          }
          const hasLocalUnsavedChanges =
            isSavePending() || latestEditorContentRef.current !== persistedContentRef.current;
          if (hasLocalUnsavedChanges) {
            logDebug("note-window", "external_watch_detect_conflict", {
              notePath,
              watchedPath,
              length: fileContent.length,
            });
            pendingExternalContentRef.current = fileContent;
            setHasExternalFileChange(true);
            return;
          }
          logDebug("note-window", "external_watch_apply_auto", {
            notePath,
            watchedPath,
            length: fileContent.length,
          });
          applyExternalFileContent(fileContent);
        })();
      }, EXTERNAL_FILE_RELOAD_DEBOUNCE_MS);
    };

    void dirname(watchedPath)
      .then((watchRootPath) => {
        logDebug("note-window", "external_watch_root_resolved", {
          notePath,
          watchedPath,
          watchRootPath,
        });
        if (disposed) return null;
        return watchImmediate(
          watchRootPath,
          (event) => {
            if (disposed) return;
            logDebug("note-window", "external_watch_event", {
              notePath,
              watchedPath,
              watchRootPath,
              eventKind: event.type,
              eventPaths: event.paths,
            });
            const eventPaths = Array.isArray(event.paths) ? event.paths : [];
            if (eventPaths.length === 0) {
              logDebug("note-window", "external_watch_event_no_paths", {
                notePath,
                watchedPath,
                watchRootPath,
              });
              scheduleReload();
              return;
            }
            const hasTargetPath = eventPaths.some((path) => {
              return normalizePathForCompare(path) === normalizedWatchedPath;
            });
            if (!hasTargetPath) {
              logDebug("note-window", "external_watch_event_ignored_other_path", {
                notePath,
                watchedPath,
                watchRootPath,
                eventPaths,
              });
              return;
            }
            scheduleReload();
          },
          { recursive: false },
        );
      })
      .then((unwatchFn) => {
        if (!unwatchFn) return;
        if (disposed) {
          logDebug("note-window", "external_watch_setup_disposed_before_bind", {
            notePath,
            watchedPath,
          });
          unwatchFn();
          return;
        }
        logDebug("note-window", "external_watch_setup_bound", { notePath, watchedPath });
        unwatch = unwatchFn;
      })
      .catch((error) => {
        logError("note-window", "external_watch_setup_failed", error, {
          notePath,
          watchedPath,
        });
      });

    return () => {
      logDebug("note-window", "external_watch_cleanup", { notePath, watchedPath });
      disposed = true;
      if (externalReloadTimerRef.current) {
        clearTimeout(externalReloadTimerRef.current);
        externalReloadTimerRef.current = null;
      }
      if (unwatch) {
        unwatch();
      }
    };
  }, [applyExternalFileContent, initialContent, isSavePending, notePath]);

  useEffect(() => {
    const applyEffects = async () => {
      if (runtimePlatform === "windows") {
        const selectedEffect = settings.noteGlassEffectWindows;
        const primaryEffect = getWindowsPrimaryEffect(selectedEffect);
        if (!primaryEffect) {
          await appWindow.clearEffects().catch((error) => {
            logError("note-window", "clear_effects_failed", error, {
              platform: runtimePlatform,
              reason: "windows_none",
            });
          });
          return;
        }
        const effectsToTry = [primaryEffect, ...getWindowsFallbackEffects(selectedEffect)];
        for (const effect of effectsToTry) {
          const applied = await appWindow
            .setEffects({
              effects: [effect],
            })
            .then(() => true)
            .catch(() => false);
          if (applied) return;
        }
        await appWindow.clearEffects().catch((error) => {
          logError("note-window", "clear_effects_failed", error, {
            platform: runtimePlatform,
            reason: "windows_fallback_failed",
          });
        });
        return;
      }
      if (runtimePlatform === "macos") {
        if (!settings.noteGlassEffectMacos) {
          await appWindow.clearEffects().catch((error) => {
            logError("note-window", "clear_effects_failed", error, {
              platform: runtimePlatform,
              reason: "macos_disabled",
            });
          });
          return;
        }
        await appWindow
          .setEffects({
            effects: [Effect.HudWindow],
          })
          .catch((error) => {
            logError("note-window", "apply_macos_glass_effect_failed", error, {
              platform: runtimePlatform,
            });
          });
        return;
      }
      await appWindow.clearEffects().catch((error) => {
        logError("note-window", "clear_effects_failed", error, {
          platform: runtimePlatform,
          reason: "other_platform",
        });
      });
    };
    void applyEffects();
  }, [appWindow, runtimePlatform, settings.noteGlassEffectMacos, settings.noteGlassEffectWindows]);

  const openSettings = useCallback(() => {
    openSettingsWindow().catch((error) => {
      logError("note-window", "open_settings_window_failed", error, { windowId: windowLabel });
    });
  }, [windowLabel]);

  const openNote = useCallback(() => {
    Promise.all([appWindow.outerPosition(), appWindow.innerSize(), appWindow.isAlwaysOnTop()])
      .then(async ([position, size, currentAlwaysOnTop]) => {
        let nextX = position.x + NEW_NOTE_POSITION_OFFSET_X;
        let nextY = position.y + NEW_NOTE_POSITION_OFFSET_Y;
        const monitorX = position.x + Math.round(size.width / 2);
        const monitorY = position.y + Math.round(size.height / 2);
        const monitor = await monitorFromPoint(monitorX, monitorY).catch(() => null);
        if (monitor) {
          const minX = monitor.workArea.position.x;
          const minY = monitor.workArea.position.y;
          const maxX = Math.max(
            minX,
            monitor.workArea.position.x + monitor.workArea.size.width - size.width,
          );
          const maxY = Math.max(
            minY,
            monitor.workArea.position.y + monitor.workArea.size.height - size.height,
          );
          nextX = clamp(nextX, minX, maxX);
          nextY = clamp(nextY, minY, maxY);
        }
        return openAndTrackNoteWindow({
          alwaysOnTop: currentAlwaysOnTop,
          opacity: noteOpacityRef.current,
          skipTaskbar: settings.hideNoteWindowsFromTaskbar,
          ensureManagedFile: true,
          bounds: {
            x: nextX,
            y: nextY,
            width: size.width,
            height: size.height,
          },
        });
      })
      .catch((error) => {
        logError("note-window", "open_note_window_failed", error, {
          windowId: windowLabel,
          notePath,
        });
      });
  }, [appWindow, notePath, settings.hideNoteWindowsFromTaskbar, windowLabel]);

  const minimizeWindow = useCallback(() => {
    if (settings.hideNoteWindowsFromTaskbar) {
      void hideWindow();
      return;
    }
    appWindow.minimize().catch((error) => {
      logError("note-window", "minimize_window_failed", error, { windowId: windowLabel });
    });
  }, [appWindow, hideWindow, settings.hideNoteWindowsFromTaskbar, windowLabel]);

  const toggleMaximizeWindow = useCallback(() => {
    appWindow
      .isMaximized()
      .then((maximized) => {
        if (maximized) {
          return appWindow.unmaximize();
        }
        return appWindow.maximize();
      })
      .catch((error) => {
        logError("note-window", "toggle_maximize_window_failed", error, {
          windowId: windowLabel,
        });
      });
  }, [appWindow, windowLabel]);

  const toggleReadOnly = useCallback(() => {
    const nextReadOnly = !noteReadOnlyRef.current;
    noteReadOnlyRef.current = nextReadOnly;
    setNoteReadOnly(nextReadOnly);
    void persistWindowState(undefined, false, undefined, undefined, nextReadOnly);
  }, [persistWindowState]);

  const closeWindow = useCallback(() => {
    appWindow.close().catch((error) => {
      logError("note-window", "close_window_failed", error, { windowId: windowLabel });
    });
  }, [appWindow, windowLabel]);

  const startWindowDrag = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      appWindow.startDragging().catch((error) => {
        logError("note-window", "start_dragging_failed", error, { windowId: windowLabel });
      });
    },
    [appWindow, windowLabel],
  );

  const closeContextMenu = useCallback(() => {
    void closeNoteContextMenu(windowLabel);
  }, [windowLabel]);

  const applyMiddleDragPosition = useCallback(() => {
    middleDragFrame.current = null;
    const target = middleDragPendingPosition.current;
    if (!target) return;
    const last = middleDragLastPosition.current;
    if (last && last.x === target.x && last.y === target.y) return;
    middleDragLastPosition.current = target;
    appWindow.setPosition(new PhysicalPosition(target.x, target.y)).catch((error) => {
      logError("note-window", "move_window_by_drag_failed", error, { windowId: windowLabel });
    });
  }, [appWindow, windowLabel]);

  const scheduleMiddleDragPosition = useCallback(() => {
    if (middleDragFrame.current !== null) return;
    middleDragFrame.current = window.requestAnimationFrame(() => {
      applyMiddleDragPosition();
    });
  }, [applyMiddleDragPosition]);

  useEffect(() => {
    const dragButton = resolveDragMouseButtonCode(settings.dragMouseButton);

    const handleMiddleAuxClick = (event: MouseEvent) => {
      if (event.button !== 1) return;
      event.preventDefault();
    };

    const handlePointerMouseDown = (event: MouseEvent) => {
      const isDragButton = event.button === dragButton;
      const isMiddleToggleButton = event.button === 1;
      if (!isDragButton && !isMiddleToggleButton) return;
      event.preventDefault();
      closeContextMenu();
      const nextState: MiddleDragState = {
        button: event.button,
        allowMove: isDragButton,
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
      Promise.all([appWindow.outerPosition(), appWindow.scaleFactor()])
        .then(([position, scaleFactor]) => {
          const state = middleDragState.current;
          if (!state) return;
          if (state !== nextState) return;
          state.windowStartX = position.x;
          state.windowStartY = position.y;
          state.scaleFactor = scaleFactor;
          state.ready = true;
          if (!state.allowMove) return;
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
          logError("note-window", "prepare_drag_state_failed", error, { windowId: windowLabel });
        });
    };

    window.addEventListener("auxclick", handleMiddleAuxClick, true);
    window.addEventListener("mousedown", handlePointerMouseDown, true);
    return () => {
      window.removeEventListener("auxclick", handleMiddleAuxClick, true);
      window.removeEventListener("mousedown", handlePointerMouseDown, true);
    };
  }, [
    appWindow,
    closeContextMenu,
    scheduleMiddleDragPosition,
    settings.dragMouseButton,
    windowLabel,
  ]);

  useEffect(() => {
    const suppressContextMenuOnce = () => {
      suppressNextContextMenu.current = true;
      window.setTimeout(() => {
        suppressNextContextMenu.current = false;
      }, 200);
    };

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
      if (!state.allowMove) return;
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
      if (state.allowMove && state.button === 2) {
        suppressContextMenuOnce();
        if (!state.moved) {
          closeContextMenu();
          void appWindow
            .scaleFactor()
            .then((scaleFactor) => {
              return openNoteContextMenu({
                parentWindowLabel: windowLabel,
                targetWindowLabel: windowLabel,
                noteId,
                screenX: state.pointerCurrentX,
                screenY: state.pointerCurrentY,
                scaleFactor,
                noteOpacity: noteOpacityRef.current,
              });
            })
            .catch((error) => {
              logError("note-window", "open_context_menu_by_right_click_failed", error, {
                windowId: windowLabel,
              });
            });
        }
      }
      if (shouldToggleAlwaysOnTop && state.button === 1 && !state.moved) {
        toggleAlwaysOnTop();
      }
    };

    const handleMouseUp = (event: MouseEvent) => {
      const state = middleDragState.current;
      if (!state) return;
      if (event.button !== state.button) return;
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
  }, [
    appWindow,
    closeContextMenu,
    noteId,
    scheduleMiddleDragPosition,
    toggleAlwaysOnTop,
    windowLabel,
  ]);

  const resizeWindowByWheel = useCallback(
    async (deltaY: number, anchorX: number, anchorY: number) => {
      if (deltaY === 0 || wheelResizeLock.current) return;

      wheelResizeLock.current = true;
      try {
        const direction = deltaY < 0 ? 1 : -1;
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
        logError("note-window", "resize_window_by_wheel_failed", error, { windowId: windowLabel });
      } finally {
        window.setTimeout(() => {
          wheelResizeLock.current = false;
        }, 16);
      }
    },
    [appWindow, windowLabel],
  );

  const adjustOpacityByWheel = useCallback(
    (deltaY: number) => {
      if (deltaY === 0) return;
      const direction = deltaY < 0 ? 1 : -1;
      const nextOpacity = clamp(
        noteOpacityRef.current + NOTE_OPACITY_STEP * direction,
        NOTE_OPACITY_MIN,
        NOTE_OPACITY_MAX,
      );
      if (nextOpacity === noteOpacityRef.current) return;
      noteOpacityRef.current = nextOpacity;
      setNoteOpacityState(nextOpacity);
      void persistWindowState(undefined, false, nextOpacity);
    },
    [persistWindowState],
  );

  useEffect(() => {
    const handleWindowWheel = (event: WheelEvent) => {
      const consumeWheelEvent = () => {
        const editor =
          event.target instanceof HTMLElement
            ? event.target.closest<HTMLElement>(".milkdown-editor")
            : document.querySelector<HTMLElement>(".milkdown-editor");
        suppressEditorScrollTopRef.current = editor?.scrollTop ?? noteScrollTopRef.current;
        suppressEditorScrollUntilRef.current = Date.now() + 140;
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === "function") {
          event.stopImmediatePropagation();
        }
      };

      if (wheelModifierMatchesEvent(event, settings.wheelOpacityModifier)) {
        consumeWheelEvent();
        closeContextMenu();
        adjustOpacityByWheel(event.deltaY);
        return;
      }
      if (!wheelModifierMatchesEvent(event, settings.wheelResizeModifier)) return;
      consumeWheelEvent();
      closeContextMenu();
      void resizeWindowByWheel(event.deltaY, event.clientX, event.clientY);
    };

    window.addEventListener("wheel", handleWindowWheel, {
      capture: true,
      passive: false,
    });
    return () => {
      window.removeEventListener("wheel", handleWindowWheel, {
        capture: true,
      });
    };
  }, [
    adjustOpacityByWheel,
    closeContextMenu,
    resizeWindowByWheel,
    settings.wheelOpacityModifier,
    settings.wheelResizeModifier,
  ]);

  useEffect(() => {
    if (settings.wheelResizeModifier !== "alt" && settings.wheelOpacityModifier !== "alt") {
      return;
    }

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
  }, [settings.wheelOpacityModifier, settings.wheelResizeModifier]);

  const localShortcutActions = useMemo(
    () => [
      {
        shortcut: settings.shortcuts.hideWindow,
        action: hideWindow,
      },
      {
        shortcut: settings.shortcuts.closeWindow,
        action: closeWindow,
      },
      {
        shortcut: settings.shortcuts.toggleAlwaysOnTop,
        action: toggleAlwaysOnTop,
      },
      {
        shortcut: settings.shortcuts.toggleReadOnly,
        action: toggleReadOnly,
      },
      {
        shortcut: settings.shortcuts.toggleTheme,
        action: toggleTheme,
      },
    ],
    [
      closeWindow,
      hideWindow,
      settings.shortcuts.closeWindow,
      settings.shortcuts.hideWindow,
      settings.shortcuts.toggleAlwaysOnTop,
      settings.shortcuts.toggleReadOnly,
      settings.shortcuts.toggleTheme,
      toggleAlwaysOnTop,
      toggleReadOnly,
      toggleTheme,
    ],
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      for (const item of localShortcutActions) {
        if (!shortcutMatchesEvent(item.shortcut, e)) continue;
        e.preventDefault();
        item.action();
        return;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [localShortcutActions]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;
    const handleAction = (action: NoteContextMenuAction) => {
      if (action === "new-note") {
        openNote();
        return;
      }
      if (action === "open-settings") {
        openSettings();
        return;
      }
      if (action === "minimize-window") {
        minimizeWindow();
        return;
      }
      if (action === "toggle-maximize") {
        toggleMaximizeWindow();
        return;
      }
      if (action === "toggle-read-only") {
        toggleReadOnly();
        return;
      }
      if (action === "hide-window") {
        hideWindow();
        return;
      }
      if (action === "close-window") {
        closeWindow();
      }
    };

    void listenNoteContextMenuAction(handleAction)
      .then((handler) => {
        if (disposed) {
          handler();
          return;
        }
        unlisten = handler;
      })
      .catch((error) => {
        logError("note-window", "listen_context_menu_actions_failed", error, {
          windowId: windowLabel,
        });
      });

    return () => {
      disposed = true;
      if (unlisten) {
        unlisten();
      }
      void closeNoteContextMenu(windowLabel);
    };
  }, [
    closeWindow,
    hideWindow,
    minimizeWindow,
    openNote,
    openSettings,
    toggleMaximizeWindow,
    toggleReadOnly,
    windowLabel,
  ]);

  const openContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (suppressNextContextMenu.current) {
        suppressNextContextMenu.current = false;
        event.preventDefault();
        return;
      }
      event.preventDefault();
      const screenX = event.screenX;
      const screenY = event.screenY;
      void appWindow
        .scaleFactor()
        .then((scaleFactor) => {
          return openNoteContextMenu({
            parentWindowLabel: windowLabel,
            targetWindowLabel: windowLabel,
            noteId,
            screenX,
            screenY,
            scaleFactor,
            noteOpacity: noteOpacityRef.current,
          });
        })
        .catch((error) => {
          logError("note-window", "open_context_menu_window_failed", error, {
            windowId: windowLabel,
            noteId,
          });
        });
    },
    [appWindow, noteId, windowLabel],
  );

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

  const pinnedVisualStyle = useMemo(
    () =>
      ({
        "--pinote-visual-opacity": noteOpacity.toString(),
        "--pinote-visual-opacity-percent": `${Math.round(noteOpacity * 100)}%`,
      }) as CSSProperties,
    [noteOpacity],
  );

  const noteBackgroundStyle = useMemo(() => {
    return {
      opacity: noteOpacity,
    } as CSSProperties;
  }, [noteOpacity]);

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
      data-read-only={noteReadOnly ? "true" : "false"}
      className="pinote-window relative flex h-screen flex-col overflow-hidden rounded-lg"
      style={pinnedVisualStyle}
      onContextMenu={openContextMenu}
    >
      <div className="absolute inset-0 bg-background" style={noteBackgroundStyle} />
      <div
        onMouseDown={startWindowDrag}
        className="absolute left-0 right-0 top-0 z-20 h-1.5 cursor-grab"
      />
      {hasExternalFileChange ? (
        <div className="absolute left-2 right-2 top-2 z-40 flex items-center gap-2 rounded-md border border-amber-400/50 bg-amber-300/20 px-2.5 py-1.5 text-xs text-amber-950 shadow-sm dark:border-amber-300/45 dark:bg-amber-200/12 dark:text-amber-100">
          <span className="min-w-0 flex-1 truncate">File changed externally.</span>
          <button
            type="button"
            onClick={reloadExternalFileContent}
            className="rounded px-1.5 py-0.5 font-medium text-amber-950 hover:bg-amber-300/40 dark:text-amber-100 dark:hover:bg-amber-200/20"
          >
            Reload
          </button>
          <button
            type="button"
            onClick={dismissExternalFileChange}
            className="rounded px-1.5 py-0.5 text-amber-900/90 hover:bg-amber-300/28 dark:text-amber-100/90 dark:hover:bg-amber-200/16"
          >
            Ignore
          </button>
        </div>
      ) : null}
      <div className="pointer-events-none absolute right-3 top-3 z-30 flex items-center gap-1.5">
        {noteReadOnly ? (
          <div
            className="pinote-readonly-badge flex h-5 w-5 items-center justify-center rounded-full transition-all duration-200"
            style={{ opacity: noteOpacity }}
          >
            <Lock size={11} />
          </div>
        ) : null}
        {alwaysOnTop ? (
          <div
            className="pinote-pinned-badge flex h-5 w-5 items-center justify-center rounded-full transition-all duration-200"
            style={{ opacity: noteOpacity }}
          >
            <Pin size={11} />
          </div>
        ) : null}
      </div>
      <div className="relative flex flex-1 flex-col overflow-hidden">
        <Editor
          key={`editor-${editorReloadToken}`}
          defaultValue={initialContent}
          onChange={handleChange}
          readOnly={noteReadOnly}
          initialScrollTop={initialEditorScrollTop}
          onScrollTopChange={handleScrollTopChange}
          style={editorStyle}
        />
      </div>
    </div>
  );
}

export default App;
