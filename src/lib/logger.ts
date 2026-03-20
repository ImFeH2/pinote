import {
  debug as pluginDebug,
  error as pluginError,
  info as pluginInfo,
  warn as pluginWarn,
} from "@tauri-apps/plugin-log";

type LogLevel = "debug" | "info" | "warn" | "error";
type LogPayload = Record<string, unknown> | undefined;
const DEBUG_LOG_ENABLED = import.meta.env.DEV;

function toErrorFields(value: unknown) {
  if (value instanceof Error) {
    return {
      errorMessage: value.message,
      errorName: value.name,
      errorStack: value.stack ?? "",
    };
  }
  if (typeof value === "string") {
    return {
      errorMessage: value,
    };
  }
  if (value === undefined) return {};
  return {
    errorValue: value,
  };
}

function buildMessage(scope: string, event: string, payload?: LogPayload) {
  const fields = payload && Object.keys(payload).length > 0 ? payload : undefined;
  if (!fields) return `${scope}:${event}`;
  try {
    return `${scope}:${event} ${JSON.stringify(fields)}`;
  } catch {
    return `${scope}:${event}`;
  }
}

function emit(level: LogLevel, message: string) {
  if (level === "debug") {
    if (!DEBUG_LOG_ENABLED) return;
    void pluginDebug(message).catch(() => {});
    return;
  }
  if (level === "info") {
    void pluginInfo(message).catch(() => {});
    return;
  }
  if (level === "warn") {
    void pluginWarn(message).catch(() => {});
    return;
  }
  void pluginError(message).catch(() => {});
}

export function logDebug(scope: string, event: string, payload?: LogPayload) {
  emit("debug", buildMessage(scope, event, payload));
}

export function logInfo(scope: string, event: string, payload?: LogPayload) {
  emit("info", buildMessage(scope, event, payload));
}

export function logWarn(scope: string, event: string, payload?: LogPayload) {
  emit("warn", buildMessage(scope, event, payload));
}

export function logError(scope: string, event: string, error?: unknown, payload?: LogPayload) {
  emit("error", buildMessage(scope, event, { ...(payload ?? {}), ...toErrorFields(error) }));
}
