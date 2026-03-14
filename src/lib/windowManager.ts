import { openNoteWindow } from "@/lib/windowApi";
import {
  createManagedNoteFile,
  getNoteIdFromPath,
  normalizeNoteId,
  resolveManagedNotePath,
} from "@/lib/notes";
import {
  type WindowBounds,
  type WindowVisibility,
  getWindowStateByNotePath,
  upsertWindowState,
} from "@/lib/windowStateCache";

interface OpenAndTrackNoteWindowOptions {
  noteId?: string;
  notePath?: string;
  windowId?: string;
  visibility?: WindowVisibility;
  focus?: boolean;
  alwaysOnTop?: boolean;
  readOnly?: boolean;
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
    readOnly: options.readOnly,
    opacity: options.opacity,
    scrollTop: options.scrollTop,
    bounds: options.bounds,
    skipTaskbar: options.skipTaskbar,
  });
  const cached = await getWindowStateByNotePath(nextNotePath);
  await upsertWindowState({
    ...opened,
    readOnly: options.readOnly ?? cached?.readOnly ?? false,
  });
  return opened;
}
