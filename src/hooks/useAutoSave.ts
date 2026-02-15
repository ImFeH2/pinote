import { useCallback, useEffect, useRef } from "react";
import {
  readTextFile,
  writeTextFile,
  mkdir,
  exists,
  BaseDirectory,
} from "@tauri-apps/plugin-fs";

const DEBOUNCE_MS = 500;
const NOTES_DIR = "notes";
const FILENAME = "notes/default.md";

async function ensureNotesDir() {
  const dirExists = await exists(NOTES_DIR, {
    baseDir: BaseDirectory.AppData,
  });
  if (!dirExists) {
    await mkdir(NOTES_DIR, {
      baseDir: BaseDirectory.AppData,
      recursive: true,
    });
  }
}

export function useAutoSave() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback((content: string) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(async () => {
      try {
        await ensureNotesDir();
        await writeTextFile(FILENAME, content, {
          baseDir: BaseDirectory.AppData,
        });
      } catch (e) {
        console.error("Failed to save note:", e);
      }
    }, DEBOUNCE_MS);
  }, []);

  const load = useCallback(async (): Promise<string> => {
    try {
      await ensureNotesDir();
      const fileExists = await exists(FILENAME, {
        baseDir: BaseDirectory.AppData,
      });
      if (!fileExists) return "";
      return await readTextFile(FILENAME, {
        baseDir: BaseDirectory.AppData,
      });
    } catch (e) {
      console.error("Failed to load note:", e);
      return "";
    }
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return { save, load };
}
