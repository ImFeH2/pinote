import { readTextFile, writeTextFile, exists, BaseDirectory } from "@tauri-apps/plugin-fs";

type Theme = "light" | "dark" | "system";
export type EditorFontFamily = "system" | "serif" | "mono";
export type WheelResizeModifier = "alt" | "ctrl" | "shift" | "meta";
export type WindowsGlassEffect = "none" | "mica" | "acrylic" | "blur";
export type DragMouseButton = "middle" | "right";
const SETTINGS_FILE = "settings.json";

export interface Settings {
  theme: Theme;
  newNoteDirectory: string;
  noteGlassEffectWindows: WindowsGlassEffect;
  noteGlassEffectMacos: boolean;
  editorFontFamily: EditorFontFamily;
  editorFontSize: number;
  editorLineHeight: number;
  editorPaddingX: number;
  editorPaddingY: number;
  launchAtStartup: boolean;
  hideNoteWindowsFromTaskbar: boolean;
  wheelResizeModifier: WheelResizeModifier;
  wheelOpacityModifier: WheelResizeModifier;
  dragMouseButton: DragMouseButton;
  openWithPinoteContextMenu: boolean;
  defaultMarkdownOpenWithPinote: boolean;
  lastUpdateCheckAt?: string;
  shortcuts: {
    restoreWindow: string;
    toggleVisibleWindows: string;
    toggleAlwaysOnTop: string;
    toggleTheme: string;
    hideWindow: string;
  };
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  newNoteDirectory: "",
  noteGlassEffectWindows: "mica",
  noteGlassEffectMacos: true,
  editorFontFamily: "system",
  editorFontSize: 15,
  editorLineHeight: 1.2,
  editorPaddingX: 10,
  editorPaddingY: 10,
  launchAtStartup: false,
  hideNoteWindowsFromTaskbar: true,
  wheelResizeModifier: "alt",
  wheelOpacityModifier: "ctrl",
  dragMouseButton: "middle",
  openWithPinoteContextMenu: false,
  defaultMarkdownOpenWithPinote: false,
  shortcuts: {
    restoreWindow: "Alt+N",
    toggleVisibleWindows: "Alt+Shift+N",
    toggleAlwaysOnTop: "Ctrl+Shift+T",
    toggleTheme: "Ctrl+Shift+D",
    hideWindow: "Escape",
  },
};

type StoredSettings = Partial<Omit<Settings, "shortcuts">> & {
  shortcuts?: Partial<Settings["shortcuts"]>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function sanitizeNewNoteDirectory(value: unknown) {
  if (typeof value !== "string") return DEFAULT_SETTINGS.newNoteDirectory;
  return value.trim();
}

function sanitizeWheelModifier(value: unknown, fallback: WheelResizeModifier): WheelResizeModifier {
  if (value === "alt" || value === "ctrl" || value === "shift" || value === "meta") {
    return value;
  }
  return fallback;
}

function sanitizeDragMouseButton(value: unknown): DragMouseButton {
  if (value === "middle" || value === "right") return value;
  return DEFAULT_SETTINGS.dragMouseButton;
}

function sanitizeWindowsGlassEffect(value: unknown): WindowsGlassEffect {
  if (value === "none" || value === "mica" || value === "acrylic" || value === "blur") {
    return value;
  }
  return DEFAULT_SETTINGS.noteGlassEffectWindows;
}

function sanitizeBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  return fallback;
}

function stripExtraFields(stored: StoredSettings): Partial<Omit<Settings, "shortcuts">> {
  const copy = { ...stored } as Record<string, unknown>;
  delete copy.shortcuts;
  delete copy.noteGlassBlur;
  return copy as Partial<Omit<Settings, "shortcuts">>;
}

function mergeSettings(stored: StoredSettings): Settings {
  const { shortcuts } = stored;
  const rest = stripExtraFields(stored);
  const mergedShortcuts = {
    ...DEFAULT_SETTINGS.shortcuts,
    ...shortcuts,
  };
  return {
    ...DEFAULT_SETTINGS,
    ...rest,
    newNoteDirectory: sanitizeNewNoteDirectory(rest.newNoteDirectory),
    noteGlassEffectWindows: sanitizeWindowsGlassEffect(rest.noteGlassEffectWindows),
    noteGlassEffectMacos: sanitizeBoolean(
      rest.noteGlassEffectMacos,
      DEFAULT_SETTINGS.noteGlassEffectMacos,
    ),
    wheelResizeModifier: sanitizeWheelModifier(
      rest.wheelResizeModifier,
      DEFAULT_SETTINGS.wheelResizeModifier,
    ),
    wheelOpacityModifier: sanitizeWheelModifier(
      rest.wheelOpacityModifier,
      DEFAULT_SETTINGS.wheelOpacityModifier,
    ),
    dragMouseButton: sanitizeDragMouseButton(rest.dragMouseButton),
    shortcuts: mergedShortcuts,
  };
}

export async function loadSettings(): Promise<Settings> {
  try {
    const fileExists = await exists(SETTINGS_FILE, {
      baseDir: BaseDirectory.AppData,
    });
    if (!fileExists) return { ...DEFAULT_SETTINGS };

    const content = await readTextFile(SETTINGS_FILE, {
      baseDir: BaseDirectory.AppData,
    });
    const parsed = JSON.parse(content) as unknown;
    if (!isRecord(parsed)) {
      return { ...DEFAULT_SETTINGS };
    }
    return mergeSettings(parsed as StoredSettings);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  try {
    await writeTextFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), {
      baseDir: BaseDirectory.AppData,
    });
  } catch (e) {
    console.error("Failed to save settings:", e);
  }
}
