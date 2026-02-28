import { readTextFile, writeTextFile, exists, BaseDirectory } from "@tauri-apps/plugin-fs";
import { DEFAULT_NOTE_ID } from "@/lib/notes";

type Theme = "light" | "dark" | "system";
export type EditorFontFamily = "system" | "serif" | "mono";
export type WheelResizeModifier = "alt" | "ctrl" | "shift" | "meta";
const NOTE_OPACITY_MIN = 0.3;
const NOTE_OPACITY_MAX = 1;

export interface Settings {
  theme: Theme;
  noteAlwaysOnTop: Record<string, boolean>;
  noteOpacity: Record<string, number>;
  editorFontFamily: EditorFontFamily;
  editorFontSize: number;
  editorLineHeight: number;
  editorPaddingX: number;
  editorPaddingY: number;
  launchAtStartup: boolean;
  wheelResizeModifier: WheelResizeModifier;
  lastUpdateCheckAt?: string;
  shortcuts: {
    toggleWindow: string;
    toggleAlwaysOnTop: string;
    toggleTheme: string;
    hideWindow: string;
  };
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  noteAlwaysOnTop: {
    [DEFAULT_NOTE_ID]: false,
  },
  noteOpacity: {
    [DEFAULT_NOTE_ID]: 1,
  },
  editorFontFamily: "system",
  editorFontSize: 15,
  editorLineHeight: 1.2,
  editorPaddingX: 10,
  editorPaddingY: 10,
  launchAtStartup: false,
  wheelResizeModifier: "alt",
  shortcuts: {
    toggleWindow: "Alt+N",
    toggleAlwaysOnTop: "Ctrl+Shift+T",
    toggleTheme: "Ctrl+Shift+D",
    hideWindow: "Escape",
  },
};

const SETTINGS_FILE = "settings.json";

interface StoredSettings extends Partial<Settings> {
  alwaysOnTop?: boolean;
  opacity?: number;
}

function sanitizeNoteAlwaysOnTop(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object") return {};
  const entries = Object.entries(value as Record<string, unknown>).filter(
    ([key, item]) => key.trim().length > 0 && typeof item === "boolean",
  );
  return Object.fromEntries(entries) as Record<string, boolean>;
}

function normalizeOpacity(value: unknown): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return Math.min(Math.max(value, NOTE_OPACITY_MIN), NOTE_OPACITY_MAX);
}

function sanitizeNoteOpacity(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") return {};
  const entries = Object.entries(value as Record<string, unknown>)
    .map(([key, item]) => [key, normalizeOpacity(item)] as const)
    .filter(([key, item]) => key.trim().length > 0 && item !== null)
    .map(([key, item]) => [key, item ?? 1]);
  return Object.fromEntries(entries) as Record<string, number>;
}

function mergeSettings(stored: StoredSettings): Settings {
  const { shortcuts, noteAlwaysOnTop, alwaysOnTop, noteOpacity, opacity, ...rest } = stored;
  const mergedNoteAlwaysOnTop = {
    ...DEFAULT_SETTINGS.noteAlwaysOnTop,
    ...sanitizeNoteAlwaysOnTop(noteAlwaysOnTop),
  };
  if (typeof alwaysOnTop === "boolean" && noteAlwaysOnTop === undefined) {
    mergedNoteAlwaysOnTop[DEFAULT_NOTE_ID] = alwaysOnTop;
  }
  const mergedNoteOpacity = {
    ...DEFAULT_SETTINGS.noteOpacity,
    ...sanitizeNoteOpacity(noteOpacity),
  };
  const legacyOpacity = normalizeOpacity(opacity);
  if (legacyOpacity !== null && noteOpacity === undefined) {
    mergedNoteOpacity[DEFAULT_NOTE_ID] = legacyOpacity;
  }
  return {
    ...DEFAULT_SETTINGS,
    ...rest,
    noteAlwaysOnTop: mergedNoteAlwaysOnTop,
    noteOpacity: mergedNoteOpacity,
    shortcuts: {
      ...DEFAULT_SETTINGS.shortcuts,
      ...shortcuts,
    },
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
