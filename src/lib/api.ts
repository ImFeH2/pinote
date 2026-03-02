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
import { loadSettings, type Settings } from "@/stores/settings";

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
const NOTE_WINDOW_MIN_WIDTH = 1;
const NOTE_WINDOW_MIN_HEIGHT = 1;
const NOTE_WINDOW_LABEL_PREFIX = "note-";
const NOTE_CONTEXT_MENU_WINDOW_SUFFIX = "-context-menu";
const NOTE_CONTEXT_MENU_WIDTH = 224;
const NOTE_CONTEXT_MENU_HEIGHT = 180;
const NOTE_CONTEXT_MENU_GAP = 8;

interface OpenNoteWindowOptions {
  windowId?: string;
  notePath?: string;
  visibility?: WindowVisibility;
  focus?: boolean;
  alwaysOnTop?: boolean;
  opacity?: number;
  scrollTop?: number;
  bounds?: WindowBounds;
  skipTaskbar?: boolean;
}

export interface OpenedNoteWindow {
  windowId: string;
  noteId: string;
  notePath: string;
  visibility: WindowVisibility;
  alwaysOnTop: boolean;
  opacity: number;
  scrollTop: number;
  bounds: WindowBounds;
  updatedAt: string;
}

export interface CliOpenNoteRequest {
  notePath: string;
}

export type NoteContextMenuAction =
  | "new-note"
  | "open-settings"
  | "minimize-window"
  | "toggle-maximize"
  | "hide-window"
  | "close-window";

export interface NoteContextMenuContext {
  targetWindowLabel: string;
  noteId: string;
  anchorX: number;
  anchorY: number;
}

interface OpenNoteContextMenuOptions {
  parentWindowLabel: string;
  targetWindowLabel: string;
  noteId: string;
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
  scrollTop = 0,
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
    scrollTop: Math.max(0, scrollTop),
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
    skipTaskbar: options.skipTaskbar ?? true,
    visible: options.visibility !== "hidden",
  } as ConstructorParameters<typeof WebviewWindow>[1]);

  await waitForWindowCreated(noteWindow);
  if (options.bounds) {
    await noteWindow.setSize(new PhysicalSize(options.bounds.width, options.bounds.height));
    await noteWindow.setPosition(new PhysicalPosition(options.bounds.x, options.bounds.y));
  }

  return noteWindow;
}

function isNoteWindowLabel(label: string) {
  return (
    label.startsWith(NOTE_WINDOW_LABEL_PREFIX) && !label.endsWith(NOTE_CONTEXT_MENU_WINDOW_SUFFIX)
  );
}

async function resolveNoteWindowSkipTaskbar(preferredValue: boolean | undefined) {
  if (typeof preferredValue === "boolean") return preferredValue;
  try {
    const settings = await loadSettings();
    return settings.hideNoteWindowsFromTaskbar;
  } catch {
    return true;
  }
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

export async function getOpenWithPinoteEnabled() {
  return invoke<boolean>("get_open_with_pinote_enabled");
}

export async function setOpenWithPinoteEnabled(enabled: boolean) {
  return invoke<boolean>("set_open_with_pinote_enabled", { enabled });
}

export async function getDefaultMarkdownOpenEnabled() {
  return invoke<boolean>("get_default_markdown_open_enabled");
}

export async function setDefaultMarkdownOpenEnabled(enabled: boolean) {
  return invoke<boolean>("set_default_markdown_open_enabled", { enabled });
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
  return {
    x: Math.round(options.screenX * scaleFactor),
    y: Math.round(options.screenY * scaleFactor),
  };
}

async function resolveContextMenuWindowPosition(
  pointerX: number,
  pointerY: number,
  width: number,
  height: number,
) {
  const monitor = await monitorFromPoint(pointerX, pointerY).catch(() => null);
  if (!monitor) {
    return {
      x: pointerX,
      y: pointerY,
    };
  }
  const workArea = monitor.workArea;
  const minX = workArea.position.x + NOTE_CONTEXT_MENU_GAP;
  const minY = workArea.position.y + NOTE_CONTEXT_MENU_GAP;
  const maxX = Math.max(
    minX,
    workArea.position.x + workArea.size.width - width - NOTE_CONTEXT_MENU_GAP,
  );
  const maxY = Math.max(
    minY,
    workArea.position.y + workArea.size.height - height - NOTE_CONTEXT_MENU_GAP,
  );
  const rightSpace = workArea.position.x + workArea.size.width - pointerX - NOTE_CONTEXT_MENU_GAP;
  const leftSpace = pointerX - workArea.position.x - NOTE_CONTEXT_MENU_GAP;
  const bottomSpace = workArea.position.y + workArea.size.height - pointerY - NOTE_CONTEXT_MENU_GAP;
  const topSpace = pointerY - workArea.position.y - NOTE_CONTEXT_MENU_GAP;
  let x = pointerX;
  let y = pointerY;
  if (rightSpace < width && leftSpace >= width) {
    x = pointerX - width;
  }
  if (bottomSpace < height && topSpace >= height) {
    y = pointerY - height;
  }
  return {
    x: clamp(x, minX, maxX),
    y: clamp(y, minY, maxY),
  };
}

function buildNoteContextMenuUrl(
  options: OpenNoteContextMenuOptions,
  pointer: { x: number; y: number },
) {
  const query = new URLSearchParams({
    view: "context-menu",
    targetWindowLabel: options.targetWindowLabel,
    noteId: options.noteId,
    anchorX: String(pointer.x),
    anchorY: String(pointer.y),
  });
  return `index.html?${query.toString()}`;
}

function buildNoteContextMenuContext(
  options: OpenNoteContextMenuOptions,
  pointer: { x: number; y: number },
): NoteContextMenuContext {
  return {
    targetWindowLabel: options.targetWindowLabel,
    noteId: options.noteId,
    anchorX: pointer.x,
    anchorY: pointer.y,
  };
}

export async function closeNoteContextMenu(parentWindowLabel: string) {
  const label = buildNoteContextMenuWindowLabel(parentWindowLabel);
  const existing = await WebviewWindow.getByLabel(label);
  if (!existing) return;
  await existing.hide().catch(() => {});
}

export async function setNoteWindowsSkipTaskbar(skipTaskbar: boolean) {
  const windows = await WebviewWindow.getAll();
  const targets = windows.filter((window) => isNoteWindowLabel(window.label));
  await Promise.all(targets.map((window) => window.setSkipTaskbar(skipTaskbar)));
}

async function emitNoteContextMenuSync(targetLabel: string, context: NoteContextMenuContext) {
  await emitTo<NoteContextMenuContext>(targetLabel, NOTE_CONTEXT_MENU_SYNC_EVENT, context);
}

export async function openNoteContextMenu(options: OpenNoteContextMenuOptions) {
  const label = buildNoteContextMenuWindowLabel(options.parentWindowLabel);
  const pointer = await resolveContextMenuPosition(options);
  const context = buildNoteContextMenuContext(options, pointer);
  let menuWindow = await WebviewWindow.getByLabel(label);
  if (!menuWindow) {
    menuWindow = new WebviewWindow(label, {
      url: buildNoteContextMenuUrl(options, pointer),
      title: "Pinote Menu",
      width: NOTE_CONTEXT_MENU_WIDTH,
      height: NOTE_CONTEXT_MENU_HEIGHT,
      decorations: false,
      transparent: true,
      backgroundColor: [0, 0, 0, 0],
      resizable: false,
      alwaysOnTop: true,
      shadow: false,
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
  const size = await menuWindow.innerSize().catch(() => ({
    width: NOTE_CONTEXT_MENU_WIDTH,
    height: NOTE_CONTEXT_MENU_HEIGHT,
  }));
  const position = await resolveContextMenuWindowPosition(
    pointer.x,
    pointer.y,
    Math.max(1, Math.round(size.width)),
    Math.max(1, Math.round(size.height)),
  );
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
    if (typeof payload.anchorX !== "number") return;
    if (typeof payload.anchorY !== "number") return;
    handler(payload);
  });
}

export async function openNoteWindow(noteId: string, options: OpenNoteWindowOptions = {}) {
  const normalizedNoteId = normalizeNoteId(noteId);
  const notePath = options.notePath?.trim() || (await resolveManagedNotePath(normalizedNoteId));
  const windowId = options.windowId?.trim() || buildNoteWindowId(notePath);
  const skipTaskbar = await resolveNoteWindowSkipTaskbar(options.skipTaskbar);
  const existing = await WebviewWindow.getByLabel(windowId);
  if (existing) {
    if (options.bounds) {
      await existing.setSize(new PhysicalSize(options.bounds.width, options.bounds.height));
      await existing.setPosition(new PhysicalPosition(options.bounds.x, options.bounds.y));
    }
    if (typeof options.alwaysOnTop === "boolean") {
      await existing.setAlwaysOnTop(options.alwaysOnTop);
    }
    await existing.setSkipTaskbar(skipTaskbar);
    if (options.visibility === "hidden") {
      await existing.hide();
      return getWindowSnapshot(
        existing,
        normalizedNoteId,
        notePath,
        options.opacity ?? 1,
        options.scrollTop ?? 0,
      );
    }
    await existing.show();
    if (options.focus !== false) {
      await existing.setFocus();
    }
    return getWindowSnapshot(
      existing,
      normalizedNoteId,
      notePath,
      options.opacity ?? 1,
      options.scrollTop ?? 0,
    );
  }

  const noteWindow = await createNoteWindow(windowId, normalizedNoteId, notePath, {
    ...options,
    skipTaskbar,
  });
  if (options.visibility === "hidden") {
    await noteWindow.hide();
    return getWindowSnapshot(
      noteWindow,
      normalizedNoteId,
      notePath,
      options.opacity ?? 1,
      options.scrollTop ?? 0,
    );
  }
  await noteWindow.show();
  if (options.focus !== false) {
    await noteWindow.setFocus();
  }
  return getWindowSnapshot(
    noteWindow,
    normalizedNoteId,
    notePath,
    options.opacity ?? 1,
    options.scrollTop ?? 0,
  );
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
