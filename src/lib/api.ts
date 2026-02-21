import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getNoteWindowLabel, getNoteWindowUrl, normalizeNoteId } from "@/lib/notes";
import type { Settings } from "@/stores/settings";

type SettingsEventPayload = {
  settings: Settings;
  source: string;
};

const SETTINGS_WINDOW_LABEL = "settings";
const NOTE_WINDOW_WIDTH = 400;
const NOTE_WINDOW_HEIGHT = 500;
const NOTE_WINDOW_MIN_WIDTH = 320;
const NOTE_WINDOW_MIN_HEIGHT = 420;

async function waitForWindowCreated(window: WebviewWindow) {
  await new Promise<void>((resolve, reject) => {
    window
      .once("tauri://created", () => {
        resolve();
      })
      .catch(reject);
    window
      .once("tauri://error", (event) => {
        reject(event.payload);
      })
      .catch(reject);
  });
}

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

  await waitForWindowCreated(settingsWindow);

  await settingsWindow.onCloseRequested((event) => {
    event.preventDefault();
    void settingsWindow.hide();
  });

  return settingsWindow;
}

async function createNoteWindow(noteId: string) {
  const label = getNoteWindowLabel(noteId);
  const noteWindow = new WebviewWindow(label, {
    url: getNoteWindowUrl(noteId),
    title: `Pinote - ${noteId}`,
    width: NOTE_WINDOW_WIDTH,
    height: NOTE_WINDOW_HEIGHT,
    minWidth: NOTE_WINDOW_MIN_WIDTH,
    minHeight: NOTE_WINDOW_MIN_HEIGHT,
    decorations: false,
    transparent: true,
    resizable: true,
  });

  await waitForWindowCreated(noteWindow);

  await noteWindow.onCloseRequested((event) => {
    event.preventDefault();
    void noteWindow.hide();
  });

  return noteWindow;
}

export async function openSettingsWindow() {
  const existing = await WebviewWindow.getByLabel(SETTINGS_WINDOW_LABEL);
  const settingsWindow = existing ?? (await createSettingsWindow());
  await settingsWindow.show();
  await settingsWindow.setFocus();
}

export async function openNoteWindow(noteId: string) {
  const normalizedNoteId = normalizeNoteId(noteId);
  const label = getNoteWindowLabel(normalizedNoteId);
  const existing = await WebviewWindow.getByLabel(label);
  if (existing) {
    await existing.show();
    await existing.setFocus();
    return normalizedNoteId;
  }

  if (label === "main") {
    throw new Error("Main window is unavailable");
  }

  const noteWindow = await createNoteWindow(normalizedNoteId);
  await noteWindow.show();
  await noteWindow.setFocus();
  return normalizedNoteId;
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
