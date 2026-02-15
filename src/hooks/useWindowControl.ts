import { useCallback, useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

export function useWindowControl() {
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const appWindow = getCurrentWindow();

  useEffect(() => {
    appWindow.isAlwaysOnTop().then(setAlwaysOnTop).catch(() => {});
  }, []);

  const toggleAlwaysOnTop = useCallback(async () => {
    try {
      const current = await appWindow.isAlwaysOnTop();
      const next = !current;
      await appWindow.setAlwaysOnTop(next);
      setAlwaysOnTop(next);
    } catch (e) {
      console.error("Failed to toggle always on top:", e);
    }
  }, []);

  const hideWindow = useCallback(async () => {
    try {
      await appWindow.hide();
    } catch (e) {
      console.error("Failed to hide window:", e);
    }
  }, []);

  return { alwaysOnTop, toggleAlwaysOnTop, hideWindow };
}
