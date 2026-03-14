import { invoke } from "@tauri-apps/api/core";

export type WindowVisibility = "visible" | "hidden";

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CachedWindowState {
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

export interface WindowStateCache {
  version: number;
  updatedAt: string;
  windows: Record<string, CachedWindowState>;
  windowOrder: string[];
  hiddenStack: string[];
}

interface UpdateWindowStateOptions {
  pushHiddenToTop?: boolean;
}

export async function loadWindowStateCache() {
  return invoke<WindowStateCache>("load_window_state_cache");
}

export async function upsertWindowState(
  state: CachedWindowState,
  options: UpdateWindowStateOptions = {},
) {
  await invoke("upsert_window_state", {
    state,
    options,
  });
}

export async function setWindowVisibility(
  windowId: string,
  visibility: WindowVisibility,
  options: UpdateWindowStateOptions = {},
) {
  await invoke("set_window_visibility", {
    windowId,
    visibility,
    options,
  });
}

export async function removeWindowState(windowId: string) {
  await invoke("remove_window_state", {
    windowId,
  });
}

export async function getWindowState(windowId: string) {
  return invoke<CachedWindowState | null>("get_window_state", {
    windowId,
  });
}

export async function getMostRecentHiddenWindowState() {
  return invoke<CachedWindowState | null>("get_most_recent_hidden_window_state");
}

export async function listWindowStatesInOrder() {
  return invoke<CachedWindowState[]>("list_window_states_in_order");
}

export async function getWindowStateByNotePath(notePath: string) {
  return invoke<CachedWindowState | null>("get_window_state_by_note_path", {
    notePath,
  });
}
