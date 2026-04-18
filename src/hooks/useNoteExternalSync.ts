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

  const handlePersistedContent = useCallback((content: string, source: PersistSource) => {
    persistedContentRef.current = content;
    if (source === "save") {
      ignoreExternalWatchUntilRef.current = Date.now() + SELF_FILE_WRITE_IGNORE_MS;
    }
  }, []);

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
    if (pending === null) return;
    logDebug("note-window", "external_watch_reload_manual", {
      notePath,
      length: pending.length,
    });
    applyExternalFileContent(pending);
  }, [applyExternalFileContent, notePath]);

  const dismissExternalFileChange = useCallback(() => {
    pendingExternalContentRef.current = null;
    setHasExternalFileChange(false);
  }, []);

  useEffect(() => {
    if (initialContent === null) return;
    let disposed = false;
    let unwatch: (() => void) | null = null;
    const watchedPath = notePath.trim();
    const normalizedWatchedPath = normalizePathForCompare(watchedPath);

    const scheduleReload = () => {
      if (externalReloadTimerRef.current) {
        clearTimeout(externalReloadTimerRef.current);
      }
      externalReloadTimerRef.current = setTimeout(() => {
        void (async () => {
          if (disposed) return;
          if (Date.now() < ignoreExternalWatchUntilRef.current) return;
          const fileContent = await readTextFile(watchedPath).catch((error) => {
            logError("note-window", "external_watch_read_file_failed", error, {
              notePath,
              watchedPath,
            });
            return null;
          });
          if (disposed) return;
          if (fileContent === null) return;
          if (fileContent === latestEditorContentRef.current) return;
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
        if (disposed) return null;
        return watchImmediate(
          watchRootPath,
          (event) => {
            if (disposed) return;
            const eventPaths = Array.isArray(event.paths) ? event.paths : [];
            if (eventPaths.length === 0) {
              scheduleReload();
              return;
            }
            const hasTargetPath = eventPaths.some((path) => {
              return normalizePathForCompare(path) === normalizedWatchedPath;
            });
            if (!hasTargetPath) return;
            scheduleReload();
          },
          { recursive: false },
        );
      })
      .then((unwatchFn) => {
        if (!unwatchFn) return;
        if (disposed) {
          unwatchFn();
          return;
        }
        unwatch = unwatchFn;
      })
      .catch((error) => {
        logError("note-window", "external_watch_setup_failed", error, {
          notePath,
          watchedPath,
        });
      });

    return () => {
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
