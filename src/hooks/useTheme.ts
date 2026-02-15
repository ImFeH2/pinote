import { useCallback, useEffect, useState } from "react";

type Theme = "light" | "dark";

function getSystemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getStoredTheme(): Theme | null {
  const stored = localStorage.getItem("pinote-theme");
  if (stored === "light" || stored === "dark") return stored;
  return null;
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => getStoredTheme() ?? getSystemTheme());

  const applyTheme = useCallback((t: Theme) => {
    document.documentElement.setAttribute("data-theme", t);
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme, applyTheme]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      if (!getStoredTheme()) {
        const newTheme = e.matches ? "dark" : "light";
        setThemeState(newTheme);
      }
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      localStorage.setItem("pinote-theme", next);
      return next;
    });
  }, []);

  return { theme, toggleTheme };
}
