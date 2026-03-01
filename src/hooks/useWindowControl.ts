import { useCallback, useEffect, useMemo } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useSettings } from "@/hooks/useSettings";

export function useWindowControl(windowId: string, defaultAlwaysOnTop = false) {
  const { settings, updateSettings } = useSettings();
  const appWindow = useMemo(() => getCurrentWindow(), []);
  const alwaysOnTop = settings.noteAlwaysOnTop[windowId] ?? defaultAlwaysOnTop;

  useEffect(() => {
    appWindow.setAlwaysOnTop(alwaysOnTop).catch(() => {});
  }, [alwaysOnTop, appWindow]);

  const toggleAlwaysOnTop = useCallback(async () => {
    const next = !alwaysOnTop;
    updateSettings({
      noteAlwaysOnTop: {
        [windowId]: next,
      },
    });
  }, [alwaysOnTop, updateSettings, windowId]);

  return { alwaysOnTop, toggleAlwaysOnTop };
}
