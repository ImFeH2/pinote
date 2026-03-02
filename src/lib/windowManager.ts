import { type CliOpenNoteRequest, openNoteWindow } from "@/lib/api";
import {
  createManagedNoteFile,
  getNoteIdFromPath,
  normalizeNoteId,
  resolveManagedNotePath,
} from "@/lib/notes";
import {
  getWindowStateByNotePath,
  listWindowStatesInOrder,
  type WindowBounds,
  type WindowVisibility,
  upsertWindowState,
} from "@/lib/windowStateCache";

interface RestoreWindowsOptions {
  skipCreateWhenEmpty?: boolean;
  skipTaskbar?: boolean;
}

interface OpenCliMarkdownNotesOptions {
  skipTaskbar?: boolean;
}

interface OpenAndTrackNoteWindowOptions {
  noteId?: string;
  notePath?: string;
  windowId?: string;
  visibility?: WindowVisibility;
  focus?: boolean;
  alwaysOnTop?: boolean;
  opacity?: number;
  scrollTop?: number;
  bounds?: WindowBounds;
  skipTaskbar?: boolean;
  ensureManagedFile?: boolean;
}

export async function openAndTrackNoteWindow(options: OpenAndTrackNoteWindowOptions = {}) {
  const inputPath = options.notePath?.trim() ?? "";
  let nextNoteId = normalizeNoteId(
    options.noteId?.trim() || (inputPath ? getNoteIdFromPath(inputPath) : undefined),
  );
  let nextNotePath = inputPath;
  if (!nextNotePath) {
    if (options.ensureManagedFile) {
      const managed = await createManagedNoteFile(nextNoteId);
      nextNoteId = managed.noteId;
      nextNotePath = managed.notePath;
    } else {
      nextNotePath = await resolveManagedNotePath(nextNoteId);
    }
  }
  const opened = await openNoteWindow(nextNoteId, {
    windowId: options.windowId,
    notePath: nextNotePath,
    visibility: options.visibility,
    focus: options.focus,
    alwaysOnTop: options.alwaysOnTop,
    opacity: options.opacity,
    scrollTop: options.scrollTop,
    bounds: options.bounds,
    skipTaskbar: options.skipTaskbar,
  });
  await upsertWindowState(opened);
  return opened;
}

export async function restoreWindowsFromCacheOrCreateNew(options: RestoreWindowsOptions = {}) {
  const states = await listWindowStatesInOrder();
  if (states.length === 0) {
    if (options.skipCreateWhenEmpty) return;
    await openAndTrackNoteWindow({
      visibility: "visible",
      focus: true,
      skipTaskbar: options.skipTaskbar,
      ensureManagedFile: true,
    });
    return;
  }

  const visibleStates = states.filter((state) => state.visibility === "visible");
  const focusWindowId = visibleStates[visibleStates.length - 1]?.windowId;

  for (const state of states) {
    await openAndTrackNoteWindow({
      noteId: state.noteId,
      windowId: state.windowId,
      notePath: state.notePath,
      visibility: state.visibility,
      focus: state.visibility === "visible" && state.windowId === focusWindowId,
      alwaysOnTop: state.alwaysOnTop,
      opacity: state.opacity,
      scrollTop: state.scrollTop,
      bounds: state.bounds,
      skipTaskbar: options.skipTaskbar,
    });
  }
}

export async function openCliMarkdownNotes(
  requests: CliOpenNoteRequest[],
  options: OpenCliMarkdownNotesOptions = {},
) {
  const notePaths: string[] = [];
  const seen = new Set<string>();
  for (const request of requests) {
    const notePath = request.notePath.trim();
    if (!notePath) continue;
    const dedupeKey = notePath.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    notePaths.push(notePath);
  }
  for (let index = 0; index < notePaths.length; index += 1) {
    const notePath = notePaths[index];
    const previous = await getWindowStateByNotePath(notePath);
    await openAndTrackNoteWindow({
      noteId: getNoteIdFromPath(notePath),
      notePath,
      visibility: "visible",
      focus: index === notePaths.length - 1,
      opacity: previous?.opacity ?? 1,
      scrollTop: previous?.scrollTop ?? 0,
      skipTaskbar: options.skipTaskbar,
    });
  }
}
