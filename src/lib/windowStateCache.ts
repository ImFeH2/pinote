import {
  BaseDirectory,
  exists,
  mkdir,
  readTextFile,
  remove,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import { buildNoteCacheKey } from "@/lib/notes";

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

const CACHE_VERSION = 2;
const CACHE_FILE = "windows.json";
const CACHE_LOCK_DIR = "windows.lock";
const RESERVED_WINDOW_IDS = new Set(["main", "settings"]);
const LOCK_RETRY_MS = 20;
const LOCK_TIMEOUT_MS = 1000;

interface UpdateWindowStateOptions {
  pushHiddenToTop?: boolean;
}

let mutationQueue = Promise.resolve();

function asNumber(value: unknown, fallback: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return value;
}

function asString(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function asVisibility(value: unknown): WindowVisibility {
  return value === "hidden" ? "hidden" : "visible";
}

function asBounds(value: unknown): WindowBounds {
  if (!value || typeof value !== "object") {
    return { x: 0, y: 0, width: 400, height: 500 };
  }
  const source = value as Record<string, unknown>;
  return {
    x: Math.round(asNumber(source.x, 0)),
    y: Math.round(asNumber(source.y, 0)),
    width: Math.max(1, Math.round(asNumber(source.width, 400))),
    height: Math.max(1, Math.round(asNumber(source.height, 500))),
  };
}

function buildEmptyCache(): WindowStateCache {
  return {
    version: CACHE_VERSION,
    updatedAt: new Date().toISOString(),
    windows: {},
    windowOrder: [],
    hiddenStack: [],
  };
}

function sanitizeWindowState(value: unknown): CachedWindowState | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const windowId = asString(source.windowId);
  const noteId = asString(source.noteId);
  const notePath = asString(source.notePath);
  if (!windowId || !noteId || !notePath) return null;
  if (RESERVED_WINDOW_IDS.has(windowId)) return null;
  const updatedAt = asString(source.updatedAt) || new Date().toISOString();
  return {
    windowId,
    noteId,
    notePath,
    visibility: asVisibility(source.visibility),
    alwaysOnTop: source.alwaysOnTop === true,
    bounds: asBounds(source.bounds),
    updatedAt,
  };
}

function sanitizeCache(value: unknown): WindowStateCache {
  if (!value || typeof value !== "object") return buildEmptyCache();
  const source = value as Record<string, unknown>;
  const version = asNumber(source.version, 0);
  if (version !== CACHE_VERSION) return buildEmptyCache();
  const windowsValue = source.windows;
  const windows: Record<string, CachedWindowState> = {};
  if (windowsValue && typeof windowsValue === "object") {
    for (const [, item] of Object.entries(windowsValue as Record<string, unknown>)) {
      const parsed = sanitizeWindowState(item);
      if (!parsed) continue;
      const cacheKey = buildNoteCacheKey(parsed.notePath);
      const previous = windows[cacheKey];
      if (!previous || parsed.updatedAt >= previous.updatedAt) {
        windows[cacheKey] = parsed;
      }
    }
  }

  const existingIds = new Set(Object.keys(windows));
  const rawWindowOrder = Array.isArray(source.windowOrder) ? source.windowOrder : [];
  const seenOrder = new Set<string>();
  const windowOrder: string[] = [];
  for (const item of rawWindowOrder) {
    const id = asString(item);
    if (!id || !existingIds.has(id) || seenOrder.has(id)) continue;
    seenOrder.add(id);
    windowOrder.push(id);
  }
  for (const id of existingIds) {
    if (seenOrder.has(id)) continue;
    windowOrder.push(id);
  }

  const rawHiddenStack = Array.isArray(source.hiddenStack) ? source.hiddenStack : [];
  const hiddenStack: string[] = [];
  for (const item of rawHiddenStack) {
    const id = asString(item);
    if (!id || !existingIds.has(id)) continue;
    const state = windows[id];
    if (!state || state.visibility !== "hidden") continue;
    hiddenStack.push(id);
  }

  return {
    version: CACHE_VERSION,
    updatedAt: asString(source.updatedAt) || new Date().toISOString(),
    windows,
    windowOrder,
    hiddenStack,
  };
}

async function readCache() {
  const fileExists = await exists(CACHE_FILE, { baseDir: BaseDirectory.AppData });
  if (!fileExists) return buildEmptyCache();
  const content = await readTextFile(CACHE_FILE, { baseDir: BaseDirectory.AppData });
  try {
    return sanitizeCache(JSON.parse(content) as unknown);
  } catch {
    return buildEmptyCache();
  }
}

async function writeCache(cache: WindowStateCache) {
  await writeTextFile(CACHE_FILE, JSON.stringify(cache, null, 2), {
    baseDir: BaseDirectory.AppData,
  });
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function acquireCacheLock() {
  const startedAt = Date.now();
  let hasForcedUnlock = false;
  while (true) {
    try {
      await mkdir(CACHE_LOCK_DIR, {
        baseDir: BaseDirectory.AppData,
      });
      return;
    } catch {
      const elapsed = Date.now() - startedAt;
      if (elapsed >= LOCK_TIMEOUT_MS && !hasForcedUnlock) {
        hasForcedUnlock = true;
        await remove(CACHE_LOCK_DIR, {
          baseDir: BaseDirectory.AppData,
          recursive: true,
        }).catch(() => {});
      }
      if (elapsed >= LOCK_TIMEOUT_MS * 2) {
        throw new Error("Failed to acquire window state cache lock");
      }
      await delay(LOCK_RETRY_MS);
    }
  }
}

async function releaseCacheLock() {
  await remove(CACHE_LOCK_DIR, {
    baseDir: BaseDirectory.AppData,
    recursive: true,
  }).catch(() => {});
}

async function mutateCache<T>(updater: (cache: WindowStateCache) => Promise<T> | T): Promise<T> {
  let resolveValue: ((value: T | PromiseLike<T>) => void) | null = null;
  let rejectValue: ((reason?: unknown) => void) | null = null;

  const result = new Promise<T>((resolve, reject) => {
    resolveValue = resolve;
    rejectValue = reject;
  });

  mutationQueue = mutationQueue
    .then(async () => {
      await acquireCacheLock();
      try {
        const cache = await readCache();
        const next = await updater(cache);
        await writeCache(cache);
        resolveValue?.(next);
      } finally {
        await releaseCacheLock();
      }
    })
    .catch((error) => {
      rejectValue?.(error);
    });

  await mutationQueue.catch(() => {});
  return result;
}

function setWindowOrder(cache: WindowStateCache, windowId: string) {
  if (cache.windowOrder.includes(windowId)) return;
  cache.windowOrder.push(windowId);
}

function setHiddenStack(cache: WindowStateCache, windowId: string, pushToTop: boolean) {
  const alreadyHidden = cache.hiddenStack.includes(windowId);
  if (alreadyHidden && !pushToTop) {
    return;
  }
  const withoutWindowId = cache.hiddenStack.filter((id) => id !== windowId);
  withoutWindowId.push(windowId);
  cache.hiddenStack = withoutWindowId;
}

function clearHiddenStack(cache: WindowStateCache, windowId: string) {
  cache.hiddenStack = cache.hiddenStack.filter((id) => id !== windowId);
}

function resolveCacheKeyByWindowId(cache: WindowStateCache, windowId: string) {
  const target = asString(windowId);
  if (!target) return "";
  if (cache.windows[target]) return target;
  for (const [cacheKey, state] of Object.entries(cache.windows)) {
    if (state.windowId === target) return cacheKey;
  }
  return "";
}

export async function loadWindowStateCache() {
  try {
    return await readCache();
  } catch {
    return buildEmptyCache();
  }
}

export async function upsertWindowState(
  state: CachedWindowState,
  options: UpdateWindowStateOptions = {},
) {
  await mutateCache(async (cache) => {
    const now = new Date().toISOString();
    const nextState: CachedWindowState = {
      ...state,
      updatedAt: state.updatedAt || now,
    };
    const cacheKey = buildNoteCacheKey(nextState.notePath);
    cache.windows[cacheKey] = nextState;
    setWindowOrder(cache, cacheKey);
    if (nextState.visibility === "hidden") {
      setHiddenStack(cache, cacheKey, options.pushHiddenToTop === true);
    } else {
      clearHiddenStack(cache, cacheKey);
    }
    cache.updatedAt = now;
  });
}

export async function setWindowVisibility(
  windowId: string,
  visibility: WindowVisibility,
  options: UpdateWindowStateOptions = {},
) {
  await mutateCache(async (cache) => {
    const cacheKey = resolveCacheKeyByWindowId(cache, windowId);
    if (!cacheKey) return;
    const state = cache.windows[cacheKey];
    if (!state) return;
    const now = new Date().toISOString();
    state.visibility = visibility;
    state.updatedAt = now;
    if (visibility === "hidden") {
      setHiddenStack(cache, cacheKey, options.pushHiddenToTop === true);
    } else {
      clearHiddenStack(cache, cacheKey);
    }
    cache.updatedAt = now;
  });
}

export async function removeWindowState(windowId: string) {
  await mutateCache(async (cache) => {
    const cacheKey = resolveCacheKeyByWindowId(cache, windowId);
    if (!cacheKey || !cache.windows[cacheKey]) return;
    const now = new Date().toISOString();
    delete cache.windows[cacheKey];
    cache.windowOrder = cache.windowOrder.filter((id) => id !== cacheKey);
    cache.hiddenStack = cache.hiddenStack.filter((id) => id !== cacheKey);
    cache.updatedAt = now;
  });
}

export async function getWindowState(windowId: string) {
  const cache = await loadWindowStateCache();
  const cacheKey = resolveCacheKeyByWindowId(cache, windowId);
  if (!cacheKey) return null;
  return cache.windows[cacheKey] ?? null;
}

export async function getMostRecentHiddenWindowState() {
  const cache = await loadWindowStateCache();
  for (let index = cache.hiddenStack.length - 1; index >= 0; index -= 1) {
    const windowId = cache.hiddenStack[index];
    const state = cache.windows[windowId];
    if (!state) continue;
    if (state.visibility !== "hidden") continue;
    return state;
  }
  return null;
}

export async function listWindowStatesInOrder() {
  const cache = await loadWindowStateCache();
  return cache.windowOrder
    .map((windowId) => cache.windows[windowId])
    .filter((item): item is CachedWindowState => Boolean(item));
}
