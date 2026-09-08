// @vitest-environment happy-dom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";
import App from "@/App";

const mocks = vi.hoisted(() => ({
  ready: true,
  toggle: vi.fn<() => Promise<boolean>>(),
  persist: vi.fn<() => Promise<void>>(),
  load: vi.fn(async () => "Note"),
  noop: () => {},
  toggleFromActions: null as (() => Promise<void> | void) | null,
}));

vi.mock("@tauri-apps/api/window", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tauri-apps/api/window")>()),
  getCurrentWindow: () => ({
    label: "note",
    listen: async () => mocks.noop,
    onScaleChanged: async () => mocks.noop,
    clearEffects: async () => {},
  }),
}));
vi.mock("@/components/Editor", () => ({ Editor: () => <div>Editor</div> }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/hooks/useTheme", () => ({
  useTheme: () => ({ toggleTheme: mocks.noop }),
}));
vi.mock("@/hooks/useSettings", async () => {
  const { DEFAULT_SETTINGS } = await import("@/stores/settings");
  return { useSettings: () => ({ settings: DEFAULT_SETTINGS }) };
});
vi.mock("@/hooks/useWindowControl", () => ({
  useWindowControl: () => ({
    alwaysOnTop: false,
    toggleAlwaysOnTop: mocks.toggle,
  }),
}));
vi.mock("@/hooks/useNoteWindowState", () => ({
  useNoteWindowState: () => ({
    hideWindow: mocks.noop,
    handleScrollTopChange: mocks.noop,
    initialEditorScrollTop: 0,
    persistWindowState: mocks.persist,
    setInitialEditorScrollTop: mocks.noop,
    windowStateReady: mocks.ready,
  }),
}));
vi.mock("@/hooks/useNoteExternalSync", () => ({
  useNoteExternalSync: ({
    setInitialContent,
  }: {
    setInitialContent: (value: string) => void;
  }) => ({
    applyLoadedContent: setInitialContent,
    dismissExternalFileChange: mocks.noop,
    handlePersistedContent: mocks.noop,
    hasExternalFileChange: false,
    reloadExternalFileContent: mocks.noop,
  }),
}));
vi.mock("@/hooks/useAutoSave", () => ({
  useAutoSave: () => ({
    save: mocks.noop,
    load: mocks.load,
    isSavePending: () => false,
  }),
}));
vi.mock("@/hooks/useNoteWindowMouseInteractions", () => ({
  useNoteWindowMouseInteractions: () => ({ openContextMenu: mocks.noop }),
}));
vi.mock("@/hooks/useNoteWindowActions", () => ({
  useNoteWindowActions: ({
    toggleAlwaysOnTop,
  }: {
    toggleAlwaysOnTop: () => Promise<void> | void;
  }) => {
    mocks.toggleFromActions = toggleAlwaysOnTop;
    return { startWindowDrag: mocks.noop };
  },
}));
vi.mock("@/lib/logger", () => ({ logError: vi.fn() }));
vi.mock("@/lib/noteHistory", () => ({ recordOpenedNote: async () => {} }));
vi.mock("@/lib/windowApi", () => ({
  bringNoteWindowsBackOnScreen: async () => {},
  getRuntimePlatform: async () => "other",
}));

test("pin changes persist after the native action, but not before window state is ready", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  let finishToggle: () => void = mocks.noop;
  mocks.toggle.mockImplementation(
    () =>
      new Promise((resolve) => {
        finishToggle = () => resolve(true);
      }),
  );
  mocks.persist.mockResolvedValue(undefined);
  try {
    await act(async () =>
      root.render(<App noteId="note" notePath="/notes/note.md" />),
    );
    const toggle = mocks.toggleFromActions;
    if (!toggle) throw new Error("Missing pin action");
    await act(async () => {
      const pending = toggle();
      expect(mocks.persist).not.toHaveBeenCalled();
      finishToggle();
      await pending;
    });
    expect(mocks.persist).toHaveBeenCalledOnce();
    mocks.ready = false;
    mocks.persist.mockClear();
    mocks.toggle.mockResolvedValue(true);
    await act(async () =>
      root.render(<App noteId="note" notePath="/notes/note.md" />),
    );
    await act(async () => mocks.toggleFromActions?.());
    expect(mocks.persist).not.toHaveBeenCalled();
    mocks.toggle.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishToggle = () => resolve(true);
        }),
    );
    const pending = mocks.toggleFromActions?.();
    mocks.ready = true;
    await act(async () =>
      root.render(<App noteId="note" notePath="/notes/note.md" />),
    );
    await act(async () => {
      finishToggle();
      await pending;
    });
    expect(mocks.persist).toHaveBeenCalledOnce();
    mocks.persist.mockClear();
    mocks.toggle.mockResolvedValue(false);
    await act(async () => mocks.toggleFromActions?.());
    expect(mocks.persist).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
  }
});
