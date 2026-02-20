import { readTextFile, writeTextFile, exists, BaseDirectory } from "@tauri-apps/plugin-fs";

type Theme = "light" | "dark" | "system";

export interface Settings {
  theme: Theme;
  alwaysOnTop: boolean;
  opacity: number;
  launchAtStartup: boolean;
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
  alwaysOnTop: false,
  opacity: 1.0,
  launchAtStartup: false,
  shortcuts: {
    toggleWindow: "Alt+N",
    toggleAlwaysOnTop: "Ctrl+Shift+T",
    toggleTheme: "Ctrl+Shift+D",
    hideWindow: "Escape",
  },
};

const SETTINGS_FILE = "settings.json";

function mergeSettings(stored: Partial<Settings>): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    shortcuts: {
      ...DEFAULT_SETTINGS.shortcuts,
      ...stored.shortcuts,
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
    const parsed = JSON.parse(content) as Partial<Settings>;
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
