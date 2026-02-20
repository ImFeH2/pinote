import React from "react";
import ReactDOM from "react-dom/client";
import App from "@/App";
import { SettingsProvider } from "@/hooks/useSettings";
import { setupLogging } from "@/lib/logging";

setupLogging({ url: window.location.href });

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <SettingsProvider>
      <App />
    </SettingsProvider>
  </React.StrictMode>,
);
