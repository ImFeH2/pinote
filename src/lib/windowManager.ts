import { openNoteWindow } from "@/lib/api";
import { buildGeneratedNoteId } from "@/lib/notes";
import { listWindowStatesInOrder, upsertWindowState } from "@/lib/windowStateCache";

export async function restoreWindowsFromCacheOrCreateNew() {
  const states = await listWindowStatesInOrder();
  if (states.length === 0) {
    const noteId = buildGeneratedNoteId();
    const opened = await openNoteWindow(noteId, {
      visibility: "visible",
      focus: true,
    });
    await upsertWindowState(opened);
    return;
  }

  const focusWindowId = states[states.length - 1]?.windowId;

  for (const state of states) {
    const opened = await openNoteWindow(state.noteId, {
      windowId: state.windowId,
      notePath: state.notePath,
      visibility: "visible",
      focus: state.windowId === focusWindowId,
      alwaysOnTop: state.alwaysOnTop,
      bounds: state.bounds,
    });
    await upsertWindowState(opened);
  }
}
