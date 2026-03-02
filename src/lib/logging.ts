import { logInfo } from "@/lib/logger";

export function setupLogging(url: string) {
  if (import.meta.env.DEV) {
    logInfo("frontend", "ready", { url });
  }
}
