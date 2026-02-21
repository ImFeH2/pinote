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

export function buildGeneratedNoteId() {
  return Date.now().toString(36);
}
