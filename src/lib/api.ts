import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  buildNoteWindowId,
  buildNoteWindowUrl,
  normalizeNoteId,
  resolveManagedNotePath,
} from "@/lib/notes";
import type { WindowBounds, WindowVisibility } from "@/lib/windowStateCache";
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

interface OpenNoteWindowOptions {
  windowId?: string;
  notePath?: string;
  visibility?: WindowVisibility;
  focus?: boolean;
  alwaysOnTop?: boolean;
  bounds?: WindowBounds;
}

export interface OpenedNoteWindow {
  windowId: string;
  noteId: string;
  notePath: string;
  visibility: WindowVisibility;
  alwaysOnTop: boolean;
  bounds: WindowBounds;
  updatedAt: string;
}

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
    center: true,
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

async function getWindowSnapshot(
  window: WebviewWindow,
  noteId: string,
  notePath: string,
): Promise<OpenedNoteWindow> {
  const [position, size, alwaysOnTop, visible] = await Promise.all([
    window.outerPosition(),
    window.innerSize(),
    window.isAlwaysOnTop(),
    window.isVisible(),
  ]);
  return {
    windowId: window.label,
    noteId,
    notePath,
    visibility: visible ? "visible" : "hidden",
    alwaysOnTop,
    bounds: {
      x: position.x,
      y: position.y,
      width: size.width,
      height: size.height,
    },
    updatedAt: new Date().toISOString(),
  };
}

async function createNoteWindow(
  windowId: string,
  noteId: string,
  notePath: string,
  options: OpenNoteWindowOptions,
) {
  const noteWindow = new WebviewWindow(windowId, {
    url: buildNoteWindowUrl({ windowId, noteId, notePath }),
    title: `Pinote - ${noteId}`,
    width: NOTE_WINDOW_WIDTH,
    height: NOTE_WINDOW_HEIGHT,
    minWidth: NOTE_WINDOW_MIN_WIDTH,
    minHeight: NOTE_WINDOW_MIN_HEIGHT,
    decorations: false,
    transparent: true,
    resizable: true,
    alwaysOnTop: options.alwaysOnTop ?? false,
    visible: options.visibility !== "hidden",
  } as ConstructorParameters<typeof WebviewWindow>[1]);

  await waitForWindowCreated(noteWindow);
  if (options.bounds) {
    await noteWindow.setSize(new PhysicalSize(options.bounds.width, options.bounds.height));
    await noteWindow.setPosition(new PhysicalPosition(options.bounds.x, options.bounds.y));
  }

  return noteWindow;
}

export async function openSettingsWindow() {
  const existing = await WebviewWindow.getByLabel(SETTINGS_WINDOW_LABEL);
  const settingsWindow = existing ?? (await createSettingsWindow());
  await settingsWindow.show();
  await settingsWindow.setFocus();
}

export async function openNoteWindow(noteId: string, options: OpenNoteWindowOptions = {}) {
  const normalizedNoteId = normalizeNoteId(noteId);
  const windowId = options.windowId?.trim() || buildNoteWindowId(normalizedNoteId);
  const notePath = options.notePath?.trim() || (await resolveManagedNotePath(normalizedNoteId));
  const existing = await WebviewWindow.getByLabel(windowId);
  if (existing) {
    if (options.bounds) {
      await existing.setSize(new PhysicalSize(options.bounds.width, options.bounds.height));
      await existing.setPosition(new PhysicalPosition(options.bounds.x, options.bounds.y));
    }
    if (typeof options.alwaysOnTop === "boolean") {
      await existing.setAlwaysOnTop(options.alwaysOnTop);
    }
    if (options.visibility === "hidden") {
      await existing.hide();
      return getWindowSnapshot(existing, normalizedNoteId, notePath);
    }
    await existing.show();
    if (options.focus !== false) {
      await existing.setFocus();
    }
    return getWindowSnapshot(existing, normalizedNoteId, notePath);
  }

  const noteWindow = await createNoteWindow(windowId, normalizedNoteId, notePath, options);
  if (options.visibility === "hidden") {
    await noteWindow.hide();
    return getWindowSnapshot(noteWindow, normalizedNoteId, notePath);
  }
  await noteWindow.show();
  if (options.focus !== false) {
    await noteWindow.setFocus();
  }
  return getWindowSnapshot(noteWindow, normalizedNoteId, notePath);
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
