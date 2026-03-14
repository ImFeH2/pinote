import { useCallback, useEffect, useState, type MutableRefObject } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { logError } from "@/lib/logger";
import {
  getWindowState,
  removeWindowState,
  type WindowVisibility,
  upsertWindowState,
} from "@/lib/windowStateCache";

const NOTE_OPACITY_MIN = 0;
const NOTE_OPACITY_MAX = 1;
const NOTE_SCROLL_STATE_DEBOUNCE_MS = 200;

type CloseRequestState = "idle" | "persisting" | "ready";

interface UseNoteWindowStateOptions {
  appWindow: ReturnType<typeof getCurrentWindow>;
  alwaysOnTop: boolean;
  noteId: string;
  notePath: string;
  windowLabel: string;
  noteOpacityRef: MutableRefObject<number>;
  noteReadOnlyRef: MutableRefObject<boolean>;
  noteScrollTopRef: MutableRefObject<number>;
  scrollPersistTimer: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  closeRequestState: MutableRefObject<CloseRequestState>;
  forceHiddenVisibilityRef: MutableRefObject<boolean>;
  hideInProgressRef: MutableRefObject<boolean>;
  setNoteOpacityState: (value: number) => void;
  setNoteReadOnly: (value: boolean) => void;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function useNoteWindowState(options: UseNoteWindowStateOptions) {
  const {
    appWindow,
    alwaysOnTop,
    noteId,
    notePath,
    windowLabel,
    noteOpacityRef,
    noteReadOnlyRef,
    noteScrollTopRef,
    scrollPersistTimer,
    closeRequestState,
    forceHiddenVisibilityRef,
    hideInProgressRef,
    setNoteOpacityState,
    setNoteReadOnly,
  } = options;
  const [initialEditorScrollTop, setInitialEditorScrollTop] = useState(0);
  const [windowStateReady, setWindowStateReady] = useState(false);

  useEffect(() => {
    let disposed = false;
    setWindowStateReady(false);
    getWindowState(windowLabel)
      .then((state) => {
        if (disposed) return;
        if (!state) return;
        if (state.noteId !== noteId) return;
        setNoteOpacityState(clamp(state.opacity, NOTE_OPACITY_MIN, NOTE_OPACITY_MAX));
        setNoteReadOnly(state.readOnly === true);
        const cachedScrollTop = Math.max(0, state.scrollTop);
        noteScrollTopRef.current = cachedScrollTop;
        setInitialEditorScrollTop(cachedScrollTop);
      })
      .catch(() => {})
      .finally(() => {
        if (disposed) return;
        setWindowStateReady(true);
      });
    return () => {
      disposed = true;
    };
  }, [noteId, noteScrollTopRef, setNoteOpacityState, setNoteReadOnly, windowLabel]);

  const persistWindowState = useCallback(
    async (
      visibility?: WindowVisibility,
      pushHiddenToTop = false,
      opacity?: number,
      scrollTop?: number,
      readOnly?: boolean,
    ) => {
      try {
        const [position, size, currentAlwaysOnTop, visible] = await Promise.all([
          appWindow.outerPosition(),
          appWindow.innerSize(),
          appWindow.isAlwaysOnTop(),
          appWindow.isVisible(),
        ]);
        let nextVisibility: WindowVisibility;
        if (visibility) {
          nextVisibility = visibility;
        } else if (forceHiddenVisibilityRef.current) {
          nextVisibility = "hidden";
        } else {
          nextVisibility = visible ? "visible" : "hidden";
        }
        if (nextVisibility === "visible") {
          forceHiddenVisibilityRef.current = false;
        }
        const nextOpacity = clamp(
          opacity ?? noteOpacityRef.current,
          NOTE_OPACITY_MIN,
          NOTE_OPACITY_MAX,
        );
        const nextScrollTop = Math.max(0, scrollTop ?? noteScrollTopRef.current);
        await upsertWindowState(
          {
            windowId: windowLabel,
            noteId,
            notePath,
            visibility: nextVisibility,
            alwaysOnTop: currentAlwaysOnTop,
            readOnly: readOnly ?? noteReadOnlyRef.current,
            opacity: nextOpacity,
            scrollTop: nextScrollTop,
            bounds: {
              x: position.x,
              y: position.y,
              width: size.width,
              height: size.height,
            },
            updatedAt: new Date().toISOString(),
          },
          { pushHiddenToTop },
        );
      } catch (error) {
        logError("note-window", "persist_window_state_failed", error, {
          windowId: windowLabel,
          notePath,
          noteId,
        });
      }
    },
    [
      appWindow,
      forceHiddenVisibilityRef,
      noteId,
      noteOpacityRef,
      notePath,
      noteReadOnlyRef,
      noteScrollTopRef,
      windowLabel,
    ],
  );

  const handleScrollTopChange = useCallback(
    (scrollTop: number) => {
      const nextScrollTop = Math.max(0, Number.isFinite(scrollTop) ? scrollTop : 0);
      noteScrollTopRef.current = nextScrollTop;
      if (scrollPersistTimer.current) {
        clearTimeout(scrollPersistTimer.current);
      }
      scrollPersistTimer.current = setTimeout(() => {
        void persistWindowState(undefined, false, undefined, nextScrollTop);
      }, NOTE_SCROLL_STATE_DEBOUNCE_MS);
    },
    [noteScrollTopRef, persistWindowState, scrollPersistTimer],
  );

  const hideWindow = useCallback(async () => {
    try {
      hideInProgressRef.current = true;
      forceHiddenVisibilityRef.current = true;
      if (scrollPersistTimer.current) {
        clearTimeout(scrollPersistTimer.current);
        scrollPersistTimer.current = null;
      }
      await persistWindowState(
        "hidden",
        true,
        noteOpacityRef.current,
        Math.max(0, noteScrollTopRef.current),
      );
      await appWindow.hide();
    } catch (error) {
      logError("note-window", "hide_window_failed", error, { windowId: windowLabel });
      forceHiddenVisibilityRef.current = false;
    } finally {
      hideInProgressRef.current = false;
    }
  }, [
    appWindow,
    forceHiddenVisibilityRef,
    hideInProgressRef,
    noteOpacityRef,
    noteScrollTopRef,
    persistWindowState,
    scrollPersistTimer,
    windowLabel,
  ]);

  useEffect(() => {
    if (!windowStateReady) return;
    void persistWindowState();
  }, [alwaysOnTop, persistWindowState, windowStateReady]);

  useEffect(() => {
    let disposed = false;
    let unlistenHandlers: Array<() => void> = [];
    const setupWindowListeners = async () => {
      const handlers = await Promise.all([
        appWindow.onMoved(() => {
          if (!windowStateReady) return;
          void persistWindowState();
        }),
        appWindow.onResized(() => {
          if (!windowStateReady) return;
          void persistWindowState();
        }),
        appWindow.onFocusChanged(({ payload }) => {
          if (!windowStateReady) return;
          if (!payload) return;
          if (hideInProgressRef.current) return;
          void persistWindowState("visible");
        }),
        appWindow.onCloseRequested((event) => {
          if (closeRequestState.current === "ready") {
            closeRequestState.current = "idle";
            return;
          }
          event.preventDefault();
          if (closeRequestState.current === "persisting") return;
          closeRequestState.current = "persisting";
          void removeWindowState(windowLabel)
            .catch((error) => {
              logError("note-window", "remove_window_state_failed", error, {
                windowId: windowLabel,
              });
            })
            .finally(() => {
              closeRequestState.current = "ready";
              appWindow.close().catch((error) => {
                closeRequestState.current = "idle";
                logError("note-window", "close_window_failed_on_request", error, {
                  windowId: windowLabel,
                });
              });
            });
        }),
      ]);
      if (disposed) {
        for (const handler of handlers) {
          handler();
        }
        return;
      }
      unlistenHandlers = handlers;
    };

    void setupWindowListeners();
    return () => {
      disposed = true;
      for (const handler of unlistenHandlers) {
        handler();
      }
      unlistenHandlers = [];
    };
  }, [
    appWindow,
    closeRequestState,
    hideInProgressRef,
    persistWindowState,
    windowLabel,
    windowStateReady,
  ]);

  useEffect(() => {
    return () => {
      if (scrollPersistTimer.current) {
        clearTimeout(scrollPersistTimer.current);
      }
    };
  }, [scrollPersistTimer]);

  return {
    hideWindow,
    handleScrollTopChange,
    initialEditorScrollTop,
    persistWindowState,
    setInitialEditorScrollTop,
    windowStateReady,
  };
}
