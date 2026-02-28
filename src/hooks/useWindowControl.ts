import { useCallback, useEffect, useMemo } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useSettings } from "@/hooks/useSettings";

export function useWindowControl(noteId: string) {
  const { settings, updateSettings } = useSettings();
  const appWindow = useMemo(() => getCurrentWindow(), []);
  const alwaysOnTop = settings.noteAlwaysOnTop[noteId] ?? false;

  useEffect(() => {
    appWindow.setAlwaysOnTop(alwaysOnTop).catch(() => {});
  }, [alwaysOnTop, appWindow]);

  const toggleAlwaysOnTop = useCallback(async () => {
    const next = !alwaysOnTop;
    updateSettings({
      noteAlwaysOnTop: {
        [noteId]: next,
      },
    });
  }, [alwaysOnTop, noteId, updateSettings]);

  const hideWindow = useCallback(async () => {
    try {
      await appWindow.hide();
    } catch (e) {
      console.error("Failed to hide window:", e);
    }
  }, [appWindow]);

  return { alwaysOnTop, toggleAlwaysOnTop, hideWindow };
}
