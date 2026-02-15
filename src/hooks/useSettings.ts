import { createContext, useContext, useCallback, useEffect, useState } from "react";
import { createElement, type ReactNode } from "react";
import { type Settings, DEFAULT_SETTINGS, loadSettings, saveSettings } from "@/stores/settings";

interface SettingsContextValue {
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
}

const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  updateSettings: () => {},
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  if (!settings) return null;

  return createElement(SettingsContext.Provider, { value: { settings, updateSettings } }, children);
}

export function useSettings() {
  return useContext(SettingsContext);
}
