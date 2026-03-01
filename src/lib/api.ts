import { emit, emitTo, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, monitorFromPoint } from "@tauri-apps/api/window";
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
const CLI_OPEN_NOTE_REQUESTED_EVENT = "cli-open-note-requested";
const NOTE_CONTEXT_MENU_ACTION_EVENT = "note-context-menu-action";
const NOTE_CONTEXT_MENU_SYNC_EVENT = "note-context-menu-sync";
const NOTE_WINDOW_WIDTH = 400;
const NOTE_WINDOW_HEIGHT = 500;
const NOTE_WINDOW_MIN_WIDTH = 320;
const NOTE_WINDOW_MIN_HEIGHT = 420;
const NOTE_CONTEXT_MENU_WINDOW_SUFFIX = "-context-menu";
const NOTE_CONTEXT_MENU_WIDTH = 224;
const NOTE_CONTEXT_MENU_HEIGHT = 336;
const NOTE_CONTEXT_MENU_GAP = 8;

interface OpenNoteWindowOptions {
  windowId?: string;
  notePath?: string;
  visibility?: WindowVisibility;
  focus?: boolean;
  alwaysOnTop?: boolean;
  opacity?: number;
  bounds?: WindowBounds;
}

export interface OpenedNoteWindow {
  windowId: string;
  noteId: string;
  notePath: string;
  visibility: WindowVisibility;
  alwaysOnTop: boolean;
  opacity: number;
  bounds: WindowBounds;
  updatedAt: string;
}

export interface CliOpenNoteRequest {
  notePath: string;
}

export type NoteContextMenuAction =
  | "new-note"
  | "open-settings"
  | "increase-opacity"
  | "decrease-opacity"
  | "reset-opacity"
  | "toggle-always-on-top"
  | "minimize-window"
  | "toggle-maximize"
  | "hide-window"
  | "close-window";

export interface NoteContextMenuContext {
  targetWindowLabel: string;
  noteId: string;
  noteOpacityPercent: number;
  alwaysOnTop: boolean;
}

interface OpenNoteContextMenuOptions extends NoteContextMenuContext {
  parentWindowLabel: string;
  screenX: number;
  screenY: number;
  scaleFactor: number;
}

interface NoteContextMenuActionPayload {
  action: NoteContextMenuAction;
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
  opacity = 1,
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
    opacity,
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
    url: buildNoteWindowUrl({
      windowId,
      noteId,
      notePath,
      noteOpacity: options.opacity,
    }),
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

export async function consumeCliOpenNoteRequests() {
  return invoke<CliOpenNoteRequest[]>("consume_cli_open_note_requests");
}

export async function listenCliOpenNoteRequested(handler: () => void): Promise<UnlistenFn> {
  return listen(CLI_OPEN_NOTE_REQUESTED_EVENT, () => {
    handler();
  });
}

function buildNoteContextMenuWindowLabel(parentWindowLabel: string) {
  return `${parentWindowLabel}${NOTE_CONTEXT_MENU_WINDOW_SUFFIX}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

async function resolveContextMenuPosition(options: OpenNoteContextMenuOptions) {
  const scaleFactor =
    Number.isFinite(options.scaleFactor) && options.scaleFactor > 0 ? options.scaleFactor : 1;
  const rawX = Math.round(options.screenX * scaleFactor);
  const rawY = Math.round(options.screenY * scaleFactor);
  const monitor = await monitorFromPoint(rawX, rawY).catch(() => null);
  if (!monitor) {
    return { x: rawX, y: rawY };
  }
  const workArea = monitor.workArea;
  const minX = workArea.position.x + NOTE_CONTEXT_MENU_GAP;
  const minY = workArea.position.y + NOTE_CONTEXT_MENU_GAP;
  const maxX = Math.max(
    minX,
    workArea.position.x + workArea.size.width - NOTE_CONTEXT_MENU_WIDTH - NOTE_CONTEXT_MENU_GAP,
  );
  const maxY = Math.max(
    minY,
    workArea.position.y + workArea.size.height - NOTE_CONTEXT_MENU_HEIGHT - NOTE_CONTEXT_MENU_GAP,
  );
  return {
    x: clamp(rawX, minX, maxX),
    y: clamp(rawY, minY, maxY),
  };
}

function buildNoteContextMenuUrl(options: OpenNoteContextMenuOptions) {
  const query = new URLSearchParams({
    view: "context-menu",
    targetWindowLabel: options.targetWindowLabel,
    noteId: options.noteId,
    noteOpacityPercent: String(options.noteOpacityPercent),
    alwaysOnTop: options.alwaysOnTop ? "1" : "0",
  });
  return `index.html?${query.toString()}`;
}

function buildNoteContextMenuContext(options: OpenNoteContextMenuOptions): NoteContextMenuContext {
  return {
    targetWindowLabel: options.targetWindowLabel,
    noteId: options.noteId,
    noteOpacityPercent: options.noteOpacityPercent,
    alwaysOnTop: options.alwaysOnTop,
  };
}

export async function closeNoteContextMenu(parentWindowLabel: string) {
  const label = buildNoteContextMenuWindowLabel(parentWindowLabel);
  const existing = await WebviewWindow.getByLabel(label);
  if (!existing) return;
  await existing.hide().catch(() => {});
}

async function emitNoteContextMenuSync(targetLabel: string, context: NoteContextMenuContext) {
  await emitTo<NoteContextMenuContext>(targetLabel, NOTE_CONTEXT_MENU_SYNC_EVENT, context);
}

export async function openNoteContextMenu(options: OpenNoteContextMenuOptions) {
  const label = buildNoteContextMenuWindowLabel(options.parentWindowLabel);
  const context = buildNoteContextMenuContext(options);
  let menuWindow = await WebviewWindow.getByLabel(label);
  if (!menuWindow) {
    menuWindow = new WebviewWindow(label, {
      url: buildNoteContextMenuUrl(options),
      title: "Pinote Menu",
      width: NOTE_CONTEXT_MENU_WIDTH,
      height: NOTE_CONTEXT_MENU_HEIGHT,
      minWidth: NOTE_CONTEXT_MENU_WIDTH,
      minHeight: NOTE_CONTEXT_MENU_HEIGHT,
      maxWidth: NOTE_CONTEXT_MENU_WIDTH,
      maxHeight: NOTE_CONTEXT_MENU_HEIGHT,
      decorations: false,
      transparent: true,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      visible: false,
      focus: true,
    } as ConstructorParameters<typeof WebviewWindow>[1]);
    await waitForWindowCreated(menuWindow);
    const persistentMenuWindow = menuWindow;
    await persistentMenuWindow.onCloseRequested((event) => {
      event.preventDefault();
      void persistentMenuWindow.hide();
    });
  }
  const position = await resolveContextMenuPosition(options);
  await emitNoteContextMenuSync(label, context).catch(() => {});
  await menuWindow.setPosition(new PhysicalPosition(position.x, position.y));
  await menuWindow.show();
  await menuWindow.setFocus();
}

export async function listenNoteContextMenuAction(
  handler: (action: NoteContextMenuAction) => void,
): Promise<UnlistenFn> {
  const window = getCurrentWindow();
  return window.listen<NoteContextMenuActionPayload>(
    NOTE_CONTEXT_MENU_ACTION_EVENT,
    ({ payload }) => {
      if (!payload || typeof payload.action !== "string") return;
      handler(payload.action as NoteContextMenuAction);
    },
  );
}

export async function emitNoteContextMenuAction(
  targetWindowLabel: string,
  action: NoteContextMenuAction,
) {
  await emitTo<NoteContextMenuActionPayload>(targetWindowLabel, NOTE_CONTEXT_MENU_ACTION_EVENT, {
    action,
  });
}

export async function listenNoteContextMenuSync(
  handler: (context: NoteContextMenuContext) => void,
): Promise<UnlistenFn> {
  const window = getCurrentWindow();
  return window.listen<NoteContextMenuContext>(NOTE_CONTEXT_MENU_SYNC_EVENT, ({ payload }) => {
    if (!payload) return;
    if (typeof payload.targetWindowLabel !== "string") return;
    if (typeof payload.noteId !== "string") return;
    if (typeof payload.noteOpacityPercent !== "number") return;
    if (typeof payload.alwaysOnTop !== "boolean") return;
    handler(payload);
  });
}

export async function openNoteWindow(noteId: string, options: OpenNoteWindowOptions = {}) {
  const normalizedNoteId = normalizeNoteId(noteId);
  const notePath = options.notePath?.trim() || (await resolveManagedNotePath(normalizedNoteId));
  const windowId = options.windowId?.trim() || buildNoteWindowId(notePath);
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
      return getWindowSnapshot(existing, normalizedNoteId, notePath, options.opacity ?? 1);
    }
    await existing.show();
    if (options.focus !== false) {
      await existing.setFocus();
    }
    return getWindowSnapshot(existing, normalizedNoteId, notePath, options.opacity ?? 1);
  }

  const noteWindow = await createNoteWindow(windowId, normalizedNoteId, notePath, options);
  if (options.visibility === "hidden") {
    await noteWindow.hide();
    return getWindowSnapshot(noteWindow, normalizedNoteId, notePath, options.opacity ?? 1);
  }
  await noteWindow.show();
  if (options.focus !== false) {
    await noteWindow.setFocus();
  }
  return getWindowSnapshot(noteWindow, normalizedNoteId, notePath, options.opacity ?? 1);
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
