import { type CliOpenNoteRequest, openNoteWindow } from "@/lib/api";
import { buildGeneratedNoteId, getNoteIdFromPath } from "@/lib/notes";
import {
  getWindowStateByNotePath,
  listWindowStatesInOrder,
  upsertWindowState,
} from "@/lib/windowStateCache";

interface RestoreWindowsOptions {
  skipCreateWhenEmpty?: boolean;
  skipTaskbar?: boolean;
}

interface OpenCliMarkdownNotesOptions {
  skipTaskbar?: boolean;
}

export async function restoreWindowsFromCacheOrCreateNew(options: RestoreWindowsOptions = {}) {
  const states = await listWindowStatesInOrder();
  if (states.length === 0) {
    if (options.skipCreateWhenEmpty) return;
    const noteId = buildGeneratedNoteId();
    const opened = await openNoteWindow(noteId, {
      visibility: "visible",
      focus: true,
      skipTaskbar: options.skipTaskbar,
    });
    await upsertWindowState(opened);
    return;
  }

  const visibleStates = states.filter((state) => state.visibility === "visible");
  const focusWindowId = visibleStates[visibleStates.length - 1]?.windowId;

  for (const state of states) {
    const opened = await openNoteWindow(state.noteId, {
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
    await upsertWindowState(opened);
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
    const opened = await openNoteWindow(getNoteIdFromPath(notePath), {
      notePath,
      visibility: "visible",
      focus: index === notePaths.length - 1,
      opacity: previous?.opacity ?? 1,
      scrollTop: previous?.scrollTop ?? 0,
      skipTaskbar: options.skipTaskbar,
    });
    await upsertWindowState(opened);
  }
}
