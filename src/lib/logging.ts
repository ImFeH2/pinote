import { info } from "@tauri-apps/plugin-log";

type LogContext = {
  url: string;
};

export function setupLogging(context: LogContext) {
  info(`frontend_ready url=${context.url}`);
}
