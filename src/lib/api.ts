import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { Settings } from "@/stores/settings";

type SettingsEventPayload = {
  settings: Settings;
  source: string;
};

const SETTINGS_WINDOW_LABEL = "settings";

async function createSettingsWindow() {
  const settingsWindow = new WebviewWindow(SETTINGS_WINDOW_LABEL, {
    url: "index.html?view=settings",
    title: "Pinote Settings",
    width: 920,
    height: 620,
    minWidth: 760,
    minHeight: 520,
    decorations: false,
    resizable: true,
  });

  await new Promise<void>((resolve, reject) => {
    settingsWindow
      .once("tauri://created", () => {
        resolve();
      })
      .catch(reject);
    settingsWindow
      .once("tauri://error", (event) => {
        reject(event.payload);
      })
      .catch(reject);
  });

  await settingsWindow.onCloseRequested((event) => {
    event.preventDefault();
    void settingsWindow.hide();
  });

  return settingsWindow;
}

export async function openSettingsWindow() {
  const existing = await WebviewWindow.getByLabel(SETTINGS_WINDOW_LABEL);
  const settingsWindow = existing ?? (await createSettingsWindow());
  await settingsWindow.show();
  await settingsWindow.setFocus();
}

export async function emitSettingsUpdated(settings: Settings) {
  await emit<SettingsEventPayload>("settings-updated", {
    settings,
    source: getCurrentWindow().label,
  });
}

export async function listenSettingsUpdated(
  handler: (settings: Settings) => void,
): Promise<UnlistenFn> {
  return listen<SettingsEventPayload>("settings-updated", (event) => {
    if (event.payload.source === getCurrentWindow().label) return;
    handler(event.payload.settings);
  });
}
