import { invoke } from "@tauri-apps/api/core";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { normalizeNoteId, resolveManagedNotePath } from "@/lib/notes";
import { recordOpenedNote } from "@/lib/noteHistory";
import { logError, logInfo } from "@/lib/logger";
import type { WindowBounds, WindowVisibility } from "@/lib/windowStateCache";

const NOTE_WINDOW_LABEL_PREFIX = "note-";
const NOTE_CONTEXT_MENU_WINDOW_SUFFIX = "-context-menu";

interface OpenNoteWindowOptions {
  windowId?: string;
  notePath?: string;
  visibility?: WindowVisibility;
  focus?: boolean;
  alwaysOnTop?: boolean;
  readOnly?: boolean;
  opacity?: number;
  scrollTop?: number;
  bounds?: WindowBounds;
  skipTaskbar?: boolean;
  centerOnCreate?: boolean;
}

export interface OpenedNoteWindow {
  windowId: string;
  noteId: string;
  notePath: string;
  visibility: WindowVisibility;
  alwaysOnTop: boolean;
  readOnly: boolean;
  opacity: number;
  scrollTop: number;
  bounds: WindowBounds;
  updatedAt: string;
}

export type RuntimePlatform = "windows" | "macos" | "other";

export interface GlobalShortcutConfig {
  newNote: string;
  restoreWindow: string;
  showAllHiddenWindows: string;
  toggleVisibleWindows: string;
}

export interface GlobalShortcutRegistrationSnapshot {
  newNote: boolean;
  restoreWindow: boolean;
  showAllHiddenWindows: boolean;
  toggleVisibleWindows: boolean;
  errors: string[];
}

function isNoteWindowLabel(label: string) {
  return (
    label.startsWith(NOTE_WINDOW_LABEL_PREFIX) && !label.endsWith(NOTE_CONTEXT_MENU_WINDOW_SUFFIX)
  );
}

export async function openSettingsWindow() {
  logInfo("window-api", "show_settings_window_requested");
  try {
    await invoke("show_settings_window");
    logInfo("window-api", "show_settings_window_finished");
  } catch (error) {
    logError("window-api", "show_settings_window_failed", error);
    throw error;
  }
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

export async function getRuntimePlatform() {
  return invoke<RuntimePlatform>("get_runtime_platform");
}

export async function setGlobalShortcuts(shortcuts: GlobalShortcutConfig) {
  return invoke<GlobalShortcutRegistrationSnapshot>("set_global_shortcuts", { shortcuts });
}

export async function setNoteWindowsSkipTaskbar(skipTaskbar: boolean) {
  const windows = await WebviewWindow.getAll();
  const targets = windows.filter((window) => isNoteWindowLabel(window.label));
  await Promise.all(targets.map((window) => window.setSkipTaskbar(skipTaskbar)));
}

export async function bringNoteWindowsBackOnScreen() {
  return invoke<number>("bring_note_windows_back_on_screen");
}

export async function openNoteWindow(noteId: string, options: OpenNoteWindowOptions = {}) {
  const normalizedNoteId = normalizeNoteId(noteId);
  const notePath = options.notePath?.trim() || (await resolveManagedNotePath(normalizedNoteId));
  logInfo("window-api", "open_note_window_requested", {
    noteId: normalizedNoteId,
    notePath,
    windowId: options.windowId,
    visibility: options.visibility,
    focus: options.focus,
    centerOnCreate: options.centerOnCreate,
    skipTaskbar: options.skipTaskbar,
  });
  let opened: OpenedNoteWindow;
  try {
    opened = await invoke<OpenedNoteWindow>("open_note_window", {
      noteId: normalizedNoteId,
      options: {
        ...options,
        notePath,
      },
    });
  } catch (error) {
    logError("window-api", "open_note_window_failed", error, {
      noteId: normalizedNoteId,
      notePath,
      windowId: options.windowId,
    });
    throw error;
  }
  logInfo("window-api", "open_note_window_finished", {
    noteId: opened.noteId,
    notePath: opened.notePath,
    windowId: opened.windowId,
    visibility: opened.visibility,
  });
  void recordOpenedNote({
    notePath: opened.notePath,
    noteId: opened.noteId,
    windowId: opened.windowId,
  }).catch((error) => {
    logError("window-api", "record_note_history_failed", error, {
      notePath: opened.notePath,
      noteId: opened.noteId,
      windowId: opened.windowId,
    });
  });
  return opened;
}
