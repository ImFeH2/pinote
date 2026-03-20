import { useCallback, useEffect, useRef } from "react";
import { readTextFile, writeTextFile, mkdir, exists } from "@tauri-apps/plugin-fs";
import { dirname } from "@tauri-apps/api/path";
import { logError } from "@/lib/logger";

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
      pendingSaveRef.current = true;
      timerRef.current = setTimeout(async () => {
        try {
          await ensureParentDir(notePath);
          await writeTextFile(notePath, content);
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
      await ensureParentDir(notePath);
      const fileExists = await exists(notePath);
      if (!fileExists) {
        return "";
      }
      const content = await readTextFile(notePath);
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
