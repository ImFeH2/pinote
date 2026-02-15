import { useCallback, useEffect, useMemo, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

export function useWindowControl() {
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const appWindow = useMemo(() => getCurrentWindow(), []);

  useEffect(() => {
    appWindow
      .isAlwaysOnTop()
      .then(setAlwaysOnTop)
      .catch(() => {});
  }, [appWindow]);

  const toggleAlwaysOnTop = useCallback(async () => {
    try {
      const current = await appWindow.isAlwaysOnTop();
      const next = !current;
      await appWindow.setAlwaysOnTop(next);
      setAlwaysOnTop(next);
    } catch (e) {
      console.error("Failed to toggle always on top:", e);
    }
  }, [appWindow]);

  const hideWindow = useCallback(async () => {
    try {
      await appWindow.hide();
    } catch (e) {
      console.error("Failed to hide window:", e);
    }
  }, [appWindow]);

  return { alwaysOnTop, toggleAlwaysOnTop, hideWindow };
}
