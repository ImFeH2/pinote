import { readTextFile, writeTextFile, exists, BaseDirectory } from "@tauri-apps/plugin-fs";
import { DEFAULT_NOTE_ID } from "@/lib/notes";

type Theme = "light" | "dark" | "system";
export type EditorFontFamily = "system" | "serif" | "mono";
export type WheelResizeModifier = "alt" | "ctrl" | "shift" | "meta";

export interface Settings {
  theme: Theme;
  noteAlwaysOnTop: Record<string, boolean>;
  opacity: number;
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
  opacity: 1.0,
  editorFontFamily: "system",
  editorFontSize: 15,
  editorLineHeight: 1.2,
  editorPaddingX: 6,
  editorPaddingY: 6,
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
}

function sanitizeNoteAlwaysOnTop(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object") return {};
  const entries = Object.entries(value as Record<string, unknown>).filter(
    ([key, item]) => key.trim().length > 0 && typeof item === "boolean",
  );
  return Object.fromEntries(entries) as Record<string, boolean>;
}

function mergeSettings(stored: StoredSettings): Settings {
  const { shortcuts, noteAlwaysOnTop, alwaysOnTop, ...rest } = stored;
  const mergedNoteAlwaysOnTop = {
    ...DEFAULT_SETTINGS.noteAlwaysOnTop,
    ...sanitizeNoteAlwaysOnTop(noteAlwaysOnTop),
  };
  if (typeof alwaysOnTop === "boolean" && noteAlwaysOnTop === undefined) {
    mergedNoteAlwaysOnTop[DEFAULT_NOTE_ID] = alwaysOnTop;
  }
  return {
    ...DEFAULT_SETTINGS,
    ...rest,
    noteAlwaysOnTop: mergedNoteAlwaysOnTop,
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
