import { useCallback, useEffect, useMemo } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useSettings } from "@/hooks/useSettings";

export function useWindowControl() {
  const { settings, updateSettings } = useSettings();
  const appWindow = useMemo(() => getCurrentWindow(), []);

  useEffect(() => {
    appWindow.setAlwaysOnTop(settings.alwaysOnTop).catch(() => {});
  }, [appWindow, settings.alwaysOnTop]);

  const toggleAlwaysOnTop = useCallback(async () => {
    const next = !settings.alwaysOnTop;
    updateSettings({ alwaysOnTop: next });
  }, [settings.alwaysOnTop, updateSettings]);

  const hideWindow = useCallback(async () => {
    try {
      await appWindow.hide();
    } catch (e) {
      console.error("Failed to hide window:", e);
    }
  }, [appWindow]);

  return { alwaysOnTop: settings.alwaysOnTop, toggleAlwaysOnTop, hideWindow };
}
