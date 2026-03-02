import { appDataDir, dirname, resolve } from "@tauri-apps/api/path";
import { exists, mkdir, writeTextFile } from "@tauri-apps/plugin-fs";
import { loadSettings } from "@/stores/settings";
const NOTE_WINDOW_PREFIX = "note-";
const NOTE_FILE_EXTENSION = ".md";
const NOTE_DIRECTORY = "notes";

function randomHexByte(byte: number) {
  return byte.toString(16).padStart(2, "0");
}

export function buildGeneratedNoteId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, randomHexByte).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

export function sanitizeNoteId(value?: string | null) {
  if (!value) return "";
  const trimmed = value.trim();
  return trimmed.replace(/[^a-zA-Z0-9_-]/g, "");
}

export function normalizeNoteId(value?: string | null) {
  const sanitized = sanitizeNoteId(value);
  return sanitized.length > 0 ? sanitized : buildGeneratedNoteId();
}

export function getNoteIdFromPath(notePath: string) {
  const fileName = notePath.split(/[\\/]/).pop() ?? "";
  const withoutExt = fileName.toLowerCase().endsWith(NOTE_FILE_EXTENSION)
    ? fileName.slice(0, -NOTE_FILE_EXTENSION.length)
    : fileName;
  return normalizeNoteId(withoutExt);
}

function hashFnv1a(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function buildNotePathHash(notePath: string) {
  const normalizedPath = notePath.trim().toLowerCase();
  return hashFnv1a(normalizedPath);
}

export function buildNoteCacheKey(notePath: string) {
  return buildNotePathHash(notePath);
}

export function buildNoteWindowId(notePath: string) {
  return `${NOTE_WINDOW_PREFIX}${buildNotePathHash(notePath)}`;
}

export function buildNoteWindowUrl(params: {
  windowId: string;
  noteId: string;
  notePath: string;
  noteOpacity?: number;
}) {
  const query = new URLSearchParams({
    view: "note",
    windowId: params.windowId,
    noteId: normalizeNoteId(params.noteId),
    notePath: params.notePath,
  });
  if (typeof params.noteOpacity === "number" && Number.isFinite(params.noteOpacity)) {
    query.set("noteOpacity", params.noteOpacity.toString());
  }
  return `index.html?${query.toString()}`;
}

export async function resolveDefaultNotesDirectory() {
  const root = await appDataDir();
  return resolve(root, NOTE_DIRECTORY);
}

export async function resolveManagedNotesDirectory() {
  const settings = await loadSettings();
  const customDirectory = settings.newNoteDirectory.trim();
  if (customDirectory) return customDirectory;
  return resolveDefaultNotesDirectory();
}

export async function resolveManagedNotePath(noteId: string) {
  const notesDirectory = await resolveManagedNotesDirectory();
  return resolve(notesDirectory, `${normalizeNoteId(noteId)}${NOTE_FILE_EXTENSION}`);
}

async function ensureParentDirectory(path: string) {
  const parent = (await dirname(path)).trim();
  if (!parent) return;
  const parentExists = await exists(parent);
  if (parentExists) return;
  await mkdir(parent, { recursive: true });
}

export async function ensureNoteFile(notePath: string) {
  const targetPath = notePath.trim();
  if (!targetPath) return;
  const fileExists = await exists(targetPath);
  if (fileExists) return;
  await ensureParentDirectory(targetPath);
  await writeTextFile(targetPath, "");
}

export async function createManagedNoteFile(noteId?: string) {
  const normalizedNoteId = normalizeNoteId(noteId);
  const notePath = await resolveManagedNotePath(normalizedNoteId);
  await ensureNoteFile(notePath);
  return {
    noteId: normalizedNoteId,
    notePath,
  };
}
