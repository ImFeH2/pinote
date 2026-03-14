import { Fragment, createElement, type ReactNode, useEffect, useSyncExternalStore } from "react";
import { DEFAULT_SETTINGS } from "@/stores/settings";
import {
  ensureSettingsStoreReady,
  getSettingsSnapshot,
  subscribeSettingsStore,
  updateSettingsStore,
  type SettingsPatch,
} from "@/stores/settingsStore";

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { ready } = useSettings();

  useEffect(() => {
    void ensureSettingsStoreReady();
  }, []);

  if (!ready) return null;

  return createElement(Fragment, null, children);
}

export function useSettings() {
  const settings = useSyncExternalStore(
    subscribeSettingsStore,
    getSettingsSnapshot,
    getSettingsSnapshot,
  );

  return {
    settings: settings ?? DEFAULT_SETTINGS,
    updateSettings: (patch: SettingsPatch) => {
      updateSettingsStore(patch);
    },
    ready: settings !== null,
  };
}
