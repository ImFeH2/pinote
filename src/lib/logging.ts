import { info } from "@tauri-apps/plugin-log";

export function setupLogging(url: string) {
  if (import.meta.env.DEV) {
    info(`frontend_ready url=${url}`);
  }
}
