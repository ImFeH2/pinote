import { dirname } from "@tauri-apps/api/path";
import { readTextFile, watchImmediate } from "@tauri-apps/plugin-fs";
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { logDebug, logError } from "@/lib/logger";

const EXTERNAL_FILE_RELOAD_DEBOUNCE_MS = 120;
const SELF_FILE_WRITE_IGNORE_MS = 420;

type PersistSource = "load" | "save";

interface UseNoteExternalSyncOptions {
  initialContent: string | null;
  notePath: string;
  isSavePending: () => boolean;
  latestEditorContentRef: MutableRefObject<string>;
  noteScrollTopRef: MutableRefObject<number>;
  setInitialContent: (value: string) => void;
  setInitialEditorScrollTop: (value: number) => void;
  setEditorReloadToken: (value: (current: number) => number) => void;
}

function normalizePathForCompare(value: string) {
  return value.trim().replace(/\//g, "\\").toLowerCase();
}

export function useNoteExternalSync(options: UseNoteExternalSyncOptions) {
  const {
    initialContent,
    notePath,
    isSavePending,
    latestEditorContentRef,
    noteScrollTopRef,
    setInitialContent,
    setInitialEditorScrollTop,
    setEditorReloadToken,
  } = options;
  const persistedContentRef = useRef("");
  const pendingExternalContentRef = useRef<string | null>(null);
  const ignoreExternalWatchUntilRef = useRef(0);
  const externalReloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hasExternalFileChange, setHasExternalFileChange] = useState(false);

  const applyLoadedContent = useCallback(
    (content: string) => {
      latestEditorContentRef.current = content;
      persistedContentRef.current = content;
      pendingExternalContentRef.current = null;
      setHasExternalFileChange(false);
      setInitialContent(content);
    },
    [latestEditorContentRef, setInitialContent],
  );

  const handlePersistedContent = useCallback(
    (content: string, source: PersistSource) => {
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
    [
      latestEditorContentRef,
      notePath,
      noteScrollTopRef,
      setEditorReloadToken,
      setInitialContent,
      setInitialEditorScrollTop,
    ],
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
  }, [applyExternalFileContent, initialContent, isSavePending, latestEditorContentRef, notePath]);

  return {
    applyLoadedContent,
    dismissExternalFileChange,
    handlePersistedContent,
    hasExternalFileChange,
    reloadExternalFileContent,
  };
}
