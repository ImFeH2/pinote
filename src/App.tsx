import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Effect, getCurrentWindow } from "@tauri-apps/api/window";
import { dirname } from "@tauri-apps/api/path";
import { readTextFile, watchImmediate } from "@tauri-apps/plugin-fs";
import { Lock, Pin } from "lucide-react";
import { Editor } from "@/components/Editor";
import { useNoteWindowActions } from "@/hooks/useNoteWindowActions";
import { useTheme } from "@/hooks/useTheme";
import { useAutoSave } from "@/hooks/useAutoSave";
import { useNoteWindowMouseInteractions } from "@/hooks/useNoteWindowMouseInteractions";
import { useNoteWindowState } from "@/hooks/useNoteWindowState";
import { useWindowControl } from "@/hooks/useWindowControl";
import { useSettings } from "@/hooks/useSettings";
import { getRuntimePlatform, type RuntimePlatform } from "@/lib/windowApi";
import { recordOpenedNote } from "@/lib/noteHistory";
import { logDebug, logError } from "@/lib/logger";
import { type WindowsGlassEffect } from "@/stores/settings";
import "@/styles/App.css";

const NOTE_OPACITY_MIN = 0;
const NOTE_OPACITY_MAX = 1;
const EXTERNAL_FILE_RELOAD_DEBOUNCE_MS = 120;
const SELF_FILE_WRITE_IGNORE_MS = 420;

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
  const noteOpacityRef = useRef(initialWindowOpacity);
  const noteReadOnlyRef = useRef(false);
  const scrollPersistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteScrollTopRef = useRef(0);
  const latestEditorContentRef = useRef("");
  const persistedContentRef = useRef("");
  const pendingExternalContentRef = useRef<string | null>(null);
  const ignoreExternalWatchUntilRef = useRef(0);
  const externalReloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  const { openContextMenu } = useNoteWindowMouseInteractions({
    appWindow,
    dragMouseButton: settings.dragMouseButton,
    noteId,
    noteOpacityRef,
    noteScrollTopRef,
    persistWindowState,
    setNoteOpacityState,
    toggleAlwaysOnTop,
    wheelOpacityModifier: settings.wheelOpacityModifier,
    wheelResizeModifier: settings.wheelResizeModifier,
    windowLabel,
  });

  const { startWindowDrag } = useNoteWindowActions({
    appWindow,
    hideWindow,
    noteOpacityRef,
    notePath,
    noteReadOnlyRef,
    persistWindowState,
    setNoteReadOnly,
    settings,
    toggleAlwaysOnTop,
    toggleTheme,
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
    [notePath, setInitialEditorScrollTop],
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
