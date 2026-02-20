import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { register, unregister } from "@tauri-apps/plugin-global-shortcut";
import { Editor } from "@/components/Editor";
import { TitleBar } from "@/components/TitleBar";
import { useTheme } from "@/hooks/useTheme";
import { useAutoSave } from "@/hooks/useAutoSave";
import { useWindowControl } from "@/hooks/useWindowControl";
import { useSettings } from "@/hooks/useSettings";
import { openSettingsWindow } from "@/lib/api";
import { shortcutMatchesEvent } from "@/lib/shortcuts";
import "@/styles/App.css";

function App({ noteId }: { noteId: string }) {
  const { toggleTheme } = useTheme();
  const { save, load } = useAutoSave(noteId);
  const { toggleAlwaysOnTop, hideWindow } = useWindowControl();
  const { settings } = useSettings();
  const [initialContent, setInitialContent] = useState<string | null>(null);
  const hasAppliedShortcutUpdate = useRef(false);
  const activeToggleShortcut = useRef(settings.shortcuts.toggleWindow);

  useEffect(() => {
    load().then((content) => {
      setInitialContent(content);
    });
  }, [load]);

  const handleChange = useCallback(
    (markdown: string) => {
      save(markdown);
    },
    [save],
  );

  const openSettings = useCallback(() => {
    openSettingsWindow().catch((error) => {
      console.error("Failed to open settings window:", error);
    });
  }, []);

  const toggleWindowVisibilityByShortcut = useCallback(async () => {
    const appWindow = getCurrentWindow();
    try {
      const visible = await appWindow.isVisible();
      if (visible) {
        await appWindow.hide();
        return;
      }
      await appWindow.show();
      await appWindow.setFocus();
    } catch (error) {
      console.error("Failed to toggle window visibility:", error);
    }
  }, []);

  useEffect(() => {
    if (!hasAppliedShortcutUpdate.current) {
      hasAppliedShortcutUpdate.current = true;
      activeToggleShortcut.current = settings.shortcuts.toggleWindow;
      return;
    }

    const previousShortcut = activeToggleShortcut.current;
    const nextShortcut = settings.shortcuts.toggleWindow;
    if (previousShortcut === nextShortcut) return;

    let disposed = false;
    const updateShortcutRegistration = async () => {
      try {
        await register(nextShortcut, (event) => {
          if (event.state !== "Pressed") return;
          void toggleWindowVisibilityByShortcut();
        });
        if (disposed) {
          await unregister(nextShortcut).catch(() => {});
          return;
        }
        await unregister(previousShortcut).catch(() => {});
        activeToggleShortcut.current = nextShortcut;
      } catch (error) {
        console.error(`Failed to update global shortcut ${nextShortcut}:`, error);
      }
    };

    void updateShortcutRegistration();
    return () => {
      disposed = true;
    };
  }, [settings.shortcuts.toggleWindow, toggleWindowVisibilityByShortcut]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (shortcutMatchesEvent(settings.shortcuts.hideWindow, e)) {
        e.preventDefault();
        hideWindow();
        return;
      }
      if (shortcutMatchesEvent(settings.shortcuts.toggleAlwaysOnTop, e)) {
        e.preventDefault();
        toggleAlwaysOnTop();
        return;
      }
      if (shortcutMatchesEvent(settings.shortcuts.toggleTheme, e)) {
        e.preventDefault();
        toggleTheme();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    hideWindow,
    settings.shortcuts.hideWindow,
    settings.shortcuts.toggleAlwaysOnTop,
    settings.shortcuts.toggleTheme,
    toggleAlwaysOnTop,
    toggleTheme,
  ]);

  if (initialContent === null) {
    return (
      <div className="flex h-screen items-center justify-center rounded-lg bg-background shadow-lg">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="relative flex h-screen flex-col overflow-hidden rounded-lg shadow-lg">
      <div className="absolute inset-0 bg-background" style={{ opacity: settings.opacity }} />
      <div className="relative flex flex-1 flex-col overflow-hidden">
        <TitleBar title="Pinote" showSettings onOpenSettings={openSettings} />
        <Editor defaultValue={initialContent} onChange={handleChange} />
      </div>
    </div>
  );
}

export default App;
