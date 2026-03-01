import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import App from "@/App";
import { BootstrapApp } from "@/BootstrapApp";
import { SettingsProvider } from "@/hooks/useSettings";
import { SettingsApp } from "@/SettingsApp";
import { setupLogging } from "@/lib/logging";
import { getNoteIdFromPath, normalizeNoteId } from "@/lib/notes";
import { checkForUpdates } from "@/lib/updater";

setupLogging(window.location.href);

let hasScheduledSilentUpdateCheck = false;

function getView() {
  const params = new URLSearchParams(window.location.search);
  return params.get("view") ?? "bootstrap";
}

function getNoteContext() {
  const params = new URLSearchParams(window.location.search);
  const notePath = params.get("notePath")?.trim() ?? "";
  if (!notePath) return null;
  const rawNoteId = params.get("noteId");
  return {
    noteId: rawNoteId ? normalizeNoteId(rawNoteId) : getNoteIdFromPath(notePath),
    notePath,
  };
}

function Root() {
  const view = getView();

  useEffect(() => {
    if (view !== "note" || hasScheduledSilentUpdateCheck) return;
    hasScheduledSilentUpdateCheck = true;
    const timer = window.setTimeout(() => {
      checkForUpdates("silent").catch(() => {});
    }, 3000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [view]);

  if (view === "settings") {
    return <SettingsApp />;
  }
  const noteContext = getNoteContext();
  if (view === "note" && noteContext) {
    return <App noteId={noteContext.noteId} notePath={noteContext.notePath} />;
  }
  return <BootstrapApp />;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <SettingsProvider>
      <Root />
    </SettingsProvider>
  </React.StrictMode>,
);
