import { useCallback, useEffect, useState } from "react";
import { Editor } from "@/components/Editor";
import { TitleBar } from "@/components/TitleBar";
import { useTheme } from "@/hooks/useTheme";
import { useAutoSave } from "@/hooks/useAutoSave";
import { useWindowControl } from "@/hooks/useWindowControl";
import { useSettings } from "@/hooks/useSettings";
import { openSettingsWindow } from "@/lib/api";
import "@/styles/App.css";

function App({ noteId }: { noteId: string }) {
  const { toggleTheme } = useTheme();
  const { save, load } = useAutoSave(noteId);
  const { toggleAlwaysOnTop, hideWindow } = useWindowControl();
  const { settings } = useSettings();
  const [initialContent, setInitialContent] = useState<string | null>(null);

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
    openSettingsWindow().catch(() => {});
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        hideWindow();
      }
      if (e.ctrlKey && e.shiftKey && e.key === "T") {
        e.preventDefault();
        toggleAlwaysOnTop();
      }
      if (e.ctrlKey && e.shiftKey && e.key === "D") {
        e.preventDefault();
        toggleTheme();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hideWindow, toggleAlwaysOnTop, toggleTheme]);

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
