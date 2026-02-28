export const DEFAULT_NOTE_ID = "default";
export const NOTE_WINDOW_PREFIX = "note-";

export function normalizeNoteId(value?: string | null) {
  if (!value) return DEFAULT_NOTE_ID;
  const trimmed = value.trim();
  const safe = trimmed.replace(/[^a-zA-Z0-9_-]/g, "");
  return safe.length > 0 ? safe : DEFAULT_NOTE_ID;
}

export function getNoteFilename(noteId: string) {
  const normalized = normalizeNoteId(noteId);
  return `notes/${normalized}.md`;
}

export function getNoteWindowLabel(noteId: string) {
  const normalized = normalizeNoteId(noteId);
  if (normalized === DEFAULT_NOTE_ID) return "main";
  return `${NOTE_WINDOW_PREFIX}${normalized}`;
}

export function getNoteWindowUrl(noteId: string) {
  const normalized = normalizeNoteId(noteId);
  return `index.html?view=note&note=${encodeURIComponent(normalized)}`;
}

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
