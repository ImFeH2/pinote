import { emitSettingsUpdated, listenSettingsUpdated } from "@/lib/settingsEvents";
import { DEFAULT_SETTINGS, loadSettings, type Settings, saveSettings } from "@/stores/settings";

export type SettingsPatch = Partial<Omit<Settings, "shortcuts">> & {
  shortcuts?: Partial<Settings["shortcuts"]>;
};

type SettingsListener = () => void;

let settingsSnapshot: Settings | null = null;
let loadPromise: Promise<void> | null = null;
let syncPromise: Promise<void> | null = null;
let updatePromise = Promise.resolve();
const listeners = new Set<SettingsListener>();

function notifySettingsListeners() {
  for (const listener of listeners) {
    listener();
  }
}

function setSettingsSnapshot(next: Settings) {
  settingsSnapshot = next;
  notifySettingsListeners();
}

function mergeSettings(current: Settings, patch: SettingsPatch): Settings {
  return {
    ...current,
    ...patch,
    shortcuts: {
      ...current.shortcuts,
      ...patch.shortcuts,
    },
  };
}

function ensureSettingsSync() {
  if (syncPromise) return syncPromise;
  syncPromise = listenSettingsUpdated((next) => {
    setSettingsSnapshot(next);
  })
    .then(() => {})
    .catch(() => {
      syncPromise = null;
    });
  return syncPromise;
}

export function ensureSettingsStoreReady() {
  if (!loadPromise) {
    loadPromise = Promise.all([loadSettings(), ensureSettingsSync()])
      .then(([settings]) => {
        if (!settingsSnapshot) setSettingsSnapshot(settings);
      })
      .catch(() => {
        if (!settingsSnapshot) setSettingsSnapshot({ ...DEFAULT_SETTINGS });
      });
  }
  return loadPromise;
}

export function subscribeSettingsStore(listener: SettingsListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSettingsSnapshot() {
  return settingsSnapshot;
}

export async function updateSettingsStore(patch: SettingsPatch) {
  const current = settingsSnapshot;
  if (!current) return;
  const next = mergeSettings(current, patch);
  setSettingsSnapshot(next);
  updatePromise = updatePromise
    .catch(() => {})
    .then(async () => {
      await saveSettings(next);
      await emitSettingsUpdated(next);
    });
  await updatePromise;
}
