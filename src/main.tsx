import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import App from "@/App";
import { SettingsProvider } from "@/hooks/useSettings";
import { SettingsApp } from "@/SettingsApp";
import { setupLogging } from "@/lib/logging";
import { checkForUpdates } from "@/lib/updater";

setupLogging(window.location.href);

let hasScheduledSilentUpdateCheck = false;

function getView() {
  const params = new URLSearchParams(window.location.search);
  return params.get("view") ?? "note";
}

function getNoteId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("note") ?? "default";
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
  return <App noteId={getNoteId()} />;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <SettingsProvider>
      <Root />
    </SettingsProvider>
  </React.StrictMode>,
);
