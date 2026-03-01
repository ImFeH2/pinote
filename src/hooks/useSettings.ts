import { createContext, useContext, useCallback, useEffect, useState } from "react";
import { createElement, type ReactNode } from "react";
import { type Settings, DEFAULT_SETTINGS, loadSettings, saveSettings } from "@/stores/settings";
import { emitSettingsUpdated, listenSettingsUpdated } from "@/lib/api";

type SettingsPatch = Partial<Omit<Settings, "shortcuts">> & {
  shortcuts?: Partial<Settings["shortcuts"]>;
};

interface SettingsContextValue {
  settings: Settings;
  updateSettings: (patch: SettingsPatch) => void;
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

  const updateSettings = useCallback((patch: SettingsPatch) => {
    setSettings((prev) => {
      if (!prev) return prev;
      const next = {
        ...prev,
        ...patch,
        shortcuts: {
          ...prev.shortcuts,
          ...patch.shortcuts,
        },
      };
      saveSettings(next);
      void emitSettingsUpdated(next);
      return next;
    });
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    listenSettingsUpdated((next) => {
      setSettings(next);
    }).then((handler) => {
      unlisten = handler;
    });
    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  if (!settings) return null;

  return createElement(SettingsContext.Provider, { value: { settings, updateSettings } }, children);
}

export function useSettings() {
  return useContext(SettingsContext);
}
