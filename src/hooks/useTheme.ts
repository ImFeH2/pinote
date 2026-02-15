import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useSettings } from "@/hooks/useSettings";

type ResolvedTheme = "light" | "dark";

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function subscribeSystemTheme(callback: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

export function useTheme() {
  const { settings, updateSettings } = useSettings();
  const systemTheme = useSyncExternalStore(subscribeSystemTheme, getSystemTheme);
  const resolvedTheme: ResolvedTheme = settings.theme === "system" ? systemTheme : settings.theme;

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolvedTheme);
  }, [resolvedTheme]);

  const toggleTheme = useCallback(() => {
    const next = resolvedTheme === "dark" ? "light" : "dark";
    updateSettings({ theme: next });
  }, [resolvedTheme, updateSettings]);

  return { theme: resolvedTheme, toggleTheme };
}
