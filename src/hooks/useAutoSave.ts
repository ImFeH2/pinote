import { useCallback, useEffect, useRef } from "react";
import { readTextFile, writeTextFile, mkdir, exists } from "@tauri-apps/plugin-fs";
import { dirname } from "@tauri-apps/api/path";
import { logDebug, logError } from "@/lib/logger";

const DEBOUNCE_MS = 500;

type PersistSource = "load" | "save";

interface UseAutoSaveOptions {
  onPersisted?: (content: string, source: PersistSource) => void;
}

async function ensureParentDir(notePath: string) {
  const parent = await dirname(notePath);
  const dirExists = await exists(parent);
  if (!dirExists) {
    await mkdir(parent, { recursive: true });
  }
}

export function useAutoSave(notePath: string, options: UseAutoSaveOptions = {}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveRef = useRef(false);
  const onPersistedRef = useRef(options.onPersisted);

  useEffect(() => {
    onPersistedRef.current = options.onPersisted;
  }, [options.onPersisted]);

  const save = useCallback(
    (content: string) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      logDebug("auto-save", "save_scheduled", {
        notePath,
        length: content.length,
      });
      pendingSaveRef.current = true;
      timerRef.current = setTimeout(async () => {
        try {
          await ensureParentDir(notePath);
          await writeTextFile(notePath, content);
          logDebug("auto-save", "save_persisted", {
            notePath,
            length: content.length,
          });
          onPersistedRef.current?.(content, "save");
        } catch (e) {
          logError("auto-save", "save_failed", e, { notePath });
        } finally {
          pendingSaveRef.current = false;
        }
      }, DEBOUNCE_MS);
    },
    [notePath],
  );

  const load = useCallback(async (): Promise<string> => {
    try {
      logDebug("auto-save", "load_begin", { notePath });
      await ensureParentDir(notePath);
      const fileExists = await exists(notePath);
      if (!fileExists) {
        logDebug("auto-save", "load_missing_file", { notePath });
        return "";
      }
      const content = await readTextFile(notePath);
      logDebug("auto-save", "load_success", {
        notePath,
        length: content.length,
      });
      onPersistedRef.current?.(content, "load");
      return content;
    } catch (e) {
      logError("auto-save", "load_failed", e, { notePath });
      return "";
    }
  }, [notePath]);

  const isSavePending = useCallback(() => {
    return pendingSaveRef.current;
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      pendingSaveRef.current = false;
    };
  }, []);

  return { save, load, isSavePending };
}
