import { readTextFile, writeTextFile, exists, BaseDirectory } from "@tauri-apps/plugin-fs";

type Theme = "light" | "dark" | "system";
export type EditorFontFamily = "system" | "serif" | "mono";
export type WheelResizeModifier = "alt" | "ctrl" | "shift" | "meta";
const NOTE_OPACITY_MIN = 0.3;
const NOTE_OPACITY_MAX = 1;
const SETTINGS_FILE = "settings.json";
const WINDOWS_FILE = "windows.json";

export interface Settings {
  theme: Theme;
  newNoteDirectory: string;
  editorFontFamily: EditorFontFamily;
  editorFontSize: number;
  editorLineHeight: number;
  editorPaddingX: number;
  editorPaddingY: number;
  launchAtStartup: boolean;
  wheelResizeModifier: WheelResizeModifier;
  wheelOpacityModifier: WheelResizeModifier;
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
  newNoteDirectory: "",
  editorFontFamily: "system",
  editorFontSize: 15,
  editorLineHeight: 1.2,
  editorPaddingX: 10,
  editorPaddingY: 10,
  launchAtStartup: false,
  wheelResizeModifier: "alt",
  wheelOpacityModifier: "ctrl",
  shortcuts: {
    restoreWindow: "Alt+N",
    toggleAlwaysOnTop: "Ctrl+Shift+T",
    toggleTheme: "Ctrl+Shift+D",
    hideWindow: "Escape",
  },
};

type StoredSettings = Partial<Omit<Settings, "shortcuts">> & {
  noteAlwaysOnTop?: Record<string, unknown>;
  noteOpacity?: Record<string, unknown>;
  alwaysOnTop?: boolean;
  opacity?: number;
  shortcuts?: Partial<Settings["shortcuts"]> & {
    toggleWindow?: string;
  };
};

function asString(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function normalizeOpacity(value: unknown): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return Math.min(Math.max(value, NOTE_OPACITY_MIN), NOTE_OPACITY_MAX);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function sanitizeLegacyNoteOpacity(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") return {};
  const entries = Object.entries(value)
    .map(([key, item]) => [asString(key), normalizeOpacity(item)] as const)
    .filter(([key, item]) => key.length > 0 && item !== null)
    .map(([key, item]) => [key, item ?? 1]);
  return Object.fromEntries(entries) as Record<string, number>;
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

function stripLegacyFields(stored: StoredSettings): Partial<Omit<Settings, "shortcuts">> {
  const copy = { ...stored };
  delete copy.shortcuts;
  delete copy.alwaysOnTop;
  delete copy.opacity;
  delete copy.noteAlwaysOnTop;
  delete copy.noteOpacity;
  return copy;
}

function mergeSettings(stored: StoredSettings): Settings {
  const { shortcuts } = stored;
  const rest = stripLegacyFields(stored);
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
    wheelResizeModifier: sanitizeWheelModifier(
      rest.wheelResizeModifier,
      DEFAULT_SETTINGS.wheelResizeModifier,
    ),
    wheelOpacityModifier: sanitizeWheelModifier(
      rest.wheelOpacityModifier,
      DEFAULT_SETTINGS.wheelOpacityModifier,
    ),
    shortcuts: mergedShortcuts,
  };
}

async function migrateLegacyWindowPreferences(stored: StoredSettings): Promise<StoredSettings> {
  const hasLegacy =
    Object.prototype.hasOwnProperty.call(stored, "noteAlwaysOnTop") ||
    Object.prototype.hasOwnProperty.call(stored, "noteOpacity");
  if (!hasLegacy) return stored;

  const legacyNoteOpacity = sanitizeLegacyNoteOpacity(stored.noteOpacity);
  if (Object.keys(legacyNoteOpacity).length > 0) {
    const fileExists = await exists(WINDOWS_FILE, { baseDir: BaseDirectory.AppData });
    if (fileExists) {
      try {
        const content = await readTextFile(WINDOWS_FILE, { baseDir: BaseDirectory.AppData });
        const parsed = JSON.parse(content) as unknown;
        if (isRecord(parsed) && isRecord(parsed.windows)) {
          let changed = false;
          const windows: Record<string, unknown> = {};
          for (const [cacheKey, item] of Object.entries(parsed.windows)) {
            if (!isRecord(item)) {
              windows[cacheKey] = item;
              continue;
            }
            const noteId = asString(item.noteId);
            const migratedOpacity = legacyNoteOpacity[noteId];
            if (typeof migratedOpacity === "number") {
              const currentOpacity = normalizeOpacity(item.opacity);
              if (currentOpacity === null || currentOpacity !== migratedOpacity) {
                windows[cacheKey] = { ...item, opacity: migratedOpacity };
                changed = true;
                continue;
              }
            }
            windows[cacheKey] = item;
          }
          if (changed) {
            await writeTextFile(WINDOWS_FILE, JSON.stringify({ ...parsed, windows }, null, 2), {
              baseDir: BaseDirectory.AppData,
            });
          }
        }
      } catch (error) {
        console.error("Failed to migrate legacy note opacity:", error);
      }
    }
  }

  const cleaned = { ...stored };
  delete cleaned.noteAlwaysOnTop;
  delete cleaned.noteOpacity;
  try {
    await writeTextFile(SETTINGS_FILE, JSON.stringify(cleaned, null, 2), {
      baseDir: BaseDirectory.AppData,
    });
  } catch (error) {
    console.error("Failed to cleanup legacy window settings fields:", error);
  }
  return cleaned;
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
    const migrated = await migrateLegacyWindowPreferences(parsed as StoredSettings);
    return mergeSettings(migrated);
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
