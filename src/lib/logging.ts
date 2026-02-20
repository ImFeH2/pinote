import { info } from "@tauri-apps/plugin-log";

type LogContext = {
  url: string;
};

export function setupLogging(context: LogContext) {
  if (import.meta.env.DEV) {
    info(`frontend_ready url=${context.url}`);
  }
}
