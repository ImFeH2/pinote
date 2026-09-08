import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useMemo, useState } from "react";
import { logError, logInfo } from "@/lib/logger";

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
      logInfo("window-control", "toggle_always_on_top", {
        windowId: appWindow.label,
        next,
      });
      return true;
    } catch (error) {
      logError("window-control", "toggle_always_on_top_failed", error, {
        windowId: appWindow.label,
      });
      return false;
    }
  }, [alwaysOnTop, appWindow]);

  return { alwaysOnTop, toggleAlwaysOnTop };
}
