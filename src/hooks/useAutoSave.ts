import { useCallback, useEffect, useRef } from "react";
import { readTextFile, writeTextFile, mkdir, exists } from "@tauri-apps/plugin-fs";
import { dirname } from "@tauri-apps/api/path";

const DEBOUNCE_MS = 500;

async function ensureParentDir(notePath: string) {
  const parent = await dirname(notePath);
  const dirExists = await exists(parent);
  if (!dirExists) {
    await mkdir(parent, { recursive: true });
  }
}

export function useAutoSave(notePath: string) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(
    (content: string) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(async () => {
        try {
          await ensureParentDir(notePath);
          await writeTextFile(notePath, content);
        } catch (e) {
          console.error("Failed to save note:", e);
        }
      }, DEBOUNCE_MS);
    },
    [notePath],
  );

  const load = useCallback(async (): Promise<string> => {
    try {
      await ensureParentDir(notePath);
      const fileExists = await exists(notePath);
      if (!fileExists) return "";
      return await readTextFile(notePath);
    } catch (e) {
      console.error("Failed to load note:", e);
      return "";
    }
  }, [notePath]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return { save, load };
}
