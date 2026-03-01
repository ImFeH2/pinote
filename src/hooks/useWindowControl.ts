import { useCallback, useEffect, useMemo, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

export function useWindowControl(defaultAlwaysOnTop = false) {
  const appWindow = useMemo(() => getCurrentWindow(), []);
  const [alwaysOnTop, setAlwaysOnTop] = useState(defaultAlwaysOnTop);

  useEffect(() => {
    appWindow
      .isAlwaysOnTop()
      .then((value) => {
        setAlwaysOnTop(value);
      })
      .catch(() => undefined);
  }, [appWindow]);

  const toggleAlwaysOnTop = useCallback(async () => {
    const next = !alwaysOnTop;
    try {
      await appWindow.setAlwaysOnTop(next);
      setAlwaysOnTop(next);
    } catch (error) {
      console.error("Failed to toggle always on top:", error);
    }
  }, [alwaysOnTop, appWindow]);

  return { alwaysOnTop, toggleAlwaysOnTop };
}
