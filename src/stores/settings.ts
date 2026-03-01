import { readTextFile, writeTextFile, exists, BaseDirectory } from "@tauri-apps/plugin-fs";

type Theme = "light" | "dark" | "system";
export type EditorFontFamily = "system" | "serif" | "mono";
export type WheelResizeModifier = "alt" | "ctrl" | "shift" | "meta";
const NOTE_OPACITY_MIN = 0.3;
const NOTE_OPACITY_MAX = 1;
const LEGACY_DEFAULT_NOTE_KEYS = new Set(["default", "main"]);

export interface Settings {
  theme: Theme;
  noteAlwaysOnTop: Record<string, boolean>;
  noteOpacity: Record<string, number>;
  newNoteDirectory: string;
  editorFontFamily: EditorFontFamily;
  editorFontSize: number;
  editorLineHeight: number;
  editorPaddingX: number;
  editorPaddingY: number;
  launchAtStartup: boolean;
  wheelResizeModifier: WheelResizeModifier;
  lastUpdateCheckAt?: string;
  shortcuts: {
    restoreWindow: string;
    toggleAlwaysOnTop: string;
    toggleTheme: string;
    hideWindow: string;
  };
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  noteAlwaysOnTop: {},
  noteOpacity: {},
  newNoteDirectory: "",
  editorFontFamily: "system",
  editorFontSize: 15,
  editorLineHeight: 1.2,
  editorPaddingX: 10,
  editorPaddingY: 10,
  launchAtStartup: false,
  wheelResizeModifier: "alt",
  shortcuts: {
    restoreWindow: "Alt+N",
    toggleAlwaysOnTop: "Ctrl+Shift+T",
    toggleTheme: "Ctrl+Shift+D",
    hideWindow: "Escape",
  },
};

const SETTINGS_FILE = "settings.json";

type StoredSettings = Partial<Omit<Settings, "shortcuts">> & {
  alwaysOnTop?: boolean;
  opacity?: number;
  shortcuts?: Partial<Settings["shortcuts"]> & {
    toggleWindow?: string;
  };
};

function normalizeWindowKey(value: unknown) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (LEGACY_DEFAULT_NOTE_KEYS.has(trimmed)) {
    return "";
  }
  return trimmed;
}

function sanitizeNoteAlwaysOnTop(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object") return {};
  const entries = Object.entries(value as Record<string, unknown>)
    .map(([key, item]) => [normalizeWindowKey(key), item] as const)
    .filter(([key, item]) => key.length > 0 && typeof item === "boolean");
  return Object.fromEntries(entries) as Record<string, boolean>;
}

function normalizeOpacity(value: unknown): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return Math.min(Math.max(value, NOTE_OPACITY_MIN), NOTE_OPACITY_MAX);
}

function sanitizeNoteOpacity(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") return {};
  const entries = Object.entries(value as Record<string, unknown>)
    .map(([key, item]) => [normalizeWindowKey(key), normalizeOpacity(item)] as const)
    .filter(([key, item]) => key.length > 0 && item !== null)
    .map(([key, item]) => [key, item ?? 1]);
  return Object.fromEntries(entries) as Record<string, number>;
}

function sanitizeNewNoteDirectory(value: unknown) {
  if (typeof value !== "string") return DEFAULT_SETTINGS.newNoteDirectory;
  return value.trim();
}

function mergeSettings(stored: StoredSettings): Settings {
  const { shortcuts, noteAlwaysOnTop, noteOpacity, ...rest } = stored;
  const mergedNoteAlwaysOnTop = {
    ...DEFAULT_SETTINGS.noteAlwaysOnTop,
    ...sanitizeNoteAlwaysOnTop(noteAlwaysOnTop),
  };
  const mergedNoteOpacity = {
    ...DEFAULT_SETTINGS.noteOpacity,
    ...sanitizeNoteOpacity(noteOpacity),
  };
  const mergedShortcuts = {
    ...DEFAULT_SETTINGS.shortcuts,
    ...shortcuts,
  };
  if (!shortcuts?.restoreWindow && typeof shortcuts?.toggleWindow === "string") {
    mergedShortcuts.restoreWindow = shortcuts.toggleWindow;
  }
  return {
    ...DEFAULT_SETTINGS,
    ...rest,
    newNoteDirectory: sanitizeNewNoteDirectory(rest.newNoteDirectory),
    noteAlwaysOnTop: mergedNoteAlwaysOnTop,
    noteOpacity: mergedNoteOpacity,
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
    const parsed = JSON.parse(content) as StoredSettings;
    if (!parsed || typeof parsed !== "object") {
      return { ...DEFAULT_SETTINGS };
    }
    return mergeSettings(parsed);
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
