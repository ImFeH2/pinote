import { useCallback, useEffect, useRef } from "react";
import { readTextFile, writeTextFile, mkdir, exists, BaseDirectory } from "@tauri-apps/plugin-fs";

const DEBOUNCE_MS = 500;
const NOTES_DIR = "notes";

function normalizeNoteId(noteId: string) {
  const value = noteId.trim();
  const safe = value.replace(/[^a-zA-Z0-9_-]/g, "");
  return safe.length > 0 ? safe : "default";
}

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

export function useAutoSave(noteId = "default") {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filename = `notes/${normalizeNoteId(noteId)}.md`;

  const save = useCallback(
    (content: string) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(async () => {
        try {
          await ensureNotesDir();
          await writeTextFile(filename, content, {
            baseDir: BaseDirectory.AppData,
          });
        } catch (e) {
          console.error("Failed to save note:", e);
        }
      }, DEBOUNCE_MS);
    },
    [filename],
  );

  const load = useCallback(async (): Promise<string> => {
    try {
      await ensureNotesDir();
      const fileExists = await exists(filename, {
        baseDir: BaseDirectory.AppData,
      });
      if (!fileExists) return "";
      return await readTextFile(filename, {
        baseDir: BaseDirectory.AppData,
      });
    } catch (e) {
      console.error("Failed to load note:", e);
      return "";
    }
  }, [filename]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return { save, load };
}
