import { getVersion } from "@tauri-apps/api/app";
import { error as logError, info as logInfo, warn as logWarn } from "@tauri-apps/plugin-log";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";

export type UpdateCheckMode = "silent" | "manual";

export type UpdateState =
  | "idle"
  | "checking"
  | "available"
  | "upToDate"
  | "downloading"
  | "readyToRestart"
  | "error";

export interface UpdateResult {
  available: boolean;
  currentVersion: string;
  latestVersion?: string;
  notes?: string;
}

export interface UpdateSnapshot extends UpdateResult {
  state: UpdateState;
  mode: UpdateCheckMode | null;
  error: string | null;
  lastCheckedAt: string | null;
  downloadProgress: number | null;
  downloadedBytes: number;
  totalBytes: number | null;
}

type UpdateListener = (snapshot: UpdateSnapshot) => void;

const listeners = new Set<UpdateListener>();

let activeUpdate: Update | null = null;
let activeCheck: Promise<UpdateResult> | null = null;
let activeDownload: Promise<void> | null = null;
let versionPromise: Promise<string> | null = null;
let pendingRestartOnly = false;

let snapshot: UpdateSnapshot = {
  state: "idle",
  mode: null,
  available: false,
  currentVersion: "",
  latestVersion: undefined,
  notes: undefined,
  error: null,
  lastCheckedAt: null,
  downloadProgress: null,
  downloadedBytes: 0,
  totalBytes: null,
};

function notifyListeners() {
  const next = getUpdateState();
  for (const listener of listeners) {
    listener(next);
  }
}

function setSnapshot(next: Partial<UpdateSnapshot>) {
  snapshot = {
    ...snapshot,
    ...next,
  };
  notifyListeners();
}

function toErrorMessage(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  return "Unknown error";
}

function mapUpdaterError(value: unknown): string {
  const message = toErrorMessage(value);
  const normalized = message.toLowerCase();
  if (
    normalized.includes("network") ||
    normalized.includes("timed out") ||
    normalized.includes("dns") ||
    normalized.includes("status:") ||
    normalized.includes("failed to send request")
  ) {
    return "Unable to connect to the update server.";
  }
  if (normalized.includes("signature") || normalized.includes("minisign")) {
    return "Update signature verification failed.";
  }
  if (normalized.includes("target") && normalized.includes("not found")) {
    return "No update package is available for this platform.";
  }
  if (normalized.includes("release not found")) {
    return "No stable release metadata is available.";
  }
  if (normalized.includes("insecure transport protocol")) {
    return "Update endpoint must use HTTPS in release mode.";
  }
  if (normalized.includes("updater does not have any endpoints")) {
    return "Update endpoint is not configured.";
  }
  if (normalized.includes("install")) {
    return "Failed to install the downloaded update.";
  }
  if (normalized.includes("restart") || normalized.includes("relaunch")) {
    return "Update installed but failed to restart the app.";
  }
  return "Update failed. Please try again later.";
}

async function resolveCurrentVersion(): Promise<string> {
  if (snapshot.currentVersion) return snapshot.currentVersion;
  if (!versionPromise) {
    versionPromise = getVersion().catch(() => "unknown");
  }
  const version = await versionPromise;
  setSnapshot({ currentVersion: version });
  return version;
}

async function disposeActiveUpdate() {
  if (!activeUpdate) return;
  try {
    await activeUpdate.close();
  } catch {
    return;
  } finally {
    activeUpdate = null;
  }
}

function updateDownloadProgress(event: DownloadEvent) {
  if (event.event === "Started") {
    setSnapshot({
      state: "downloading",
      error: null,
      downloadProgress: 0,
      downloadedBytes: 0,
      totalBytes: event.data.contentLength ?? null,
    });
    return;
  }

  if (event.event === "Progress") {
    const downloadedBytes = snapshot.downloadedBytes + event.data.chunkLength;
    const totalBytes = snapshot.totalBytes;
    const downloadProgress =
      totalBytes && totalBytes > 0
        ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100))
        : null;
    setSnapshot({
      state: "downloading",
      downloadProgress,
      downloadedBytes,
    });
    return;
  }

  if (event.event === "Finished") {
    const totalBytes = snapshot.totalBytes;
    setSnapshot({
      state: "downloading",
      downloadProgress: totalBytes ? 100 : snapshot.downloadProgress,
      downloadedBytes: totalBytes ?? snapshot.downloadedBytes,
    });
  }
}

export function getUpdateState(): UpdateSnapshot {
  return { ...snapshot };
}

export function subscribeUpdateState(listener: UpdateListener): () => void {
  listeners.add(listener);
  listener(getUpdateState());
  return () => {
    listeners.delete(listener);
  };
}

export async function checkForUpdates(mode: UpdateCheckMode): Promise<UpdateResult> {
  if (activeCheck) return activeCheck;

  activeCheck = (async () => {
    pendingRestartOnly = false;
    setSnapshot({
      state: "checking",
      mode,
      error: null,
      downloadProgress: null,
      downloadedBytes: 0,
      totalBytes: null,
    });

    const currentVersion = await resolveCurrentVersion();
    const checkedAt = new Date().toISOString();

    try {
      const update = await check();

      if (update) {
        await disposeActiveUpdate();
        activeUpdate = update;

        const result: UpdateResult = {
          available: true,
          currentVersion: update.currentVersion || currentVersion,
          latestVersion: update.version,
          notes: update.body,
        };

        setSnapshot({
          ...result,
          state: "available",
          mode,
          error: null,
          lastCheckedAt: checkedAt,
          downloadProgress: null,
          downloadedBytes: 0,
          totalBytes: null,
        });

        void logInfo(
          `update_available mode=${mode} current=${result.currentVersion} latest=${result.latestVersion ?? "unknown"}`,
        );
        return result;
      }

      await disposeActiveUpdate();

      const result: UpdateResult = {
        available: false,
        currentVersion,
      };

      setSnapshot({
        ...result,
        state: "upToDate",
        mode,
        latestVersion: undefined,
        notes: undefined,
        error: null,
        lastCheckedAt: checkedAt,
        downloadProgress: null,
        downloadedBytes: 0,
        totalBytes: null,
      });

      void logInfo(`update_not_found mode=${mode} current=${currentVersion}`);
      return result;
    } catch (value) {
      const errorMessage = mapUpdaterError(value);
      setSnapshot({
        state: "error",
        mode,
        error: errorMessage,
        lastCheckedAt: checkedAt,
        downloadProgress: null,
        downloadedBytes: 0,
        totalBytes: null,
      });

      const details = toErrorMessage(value);
      void logWarn(`update_check_failed mode=${mode} message=${details}`);

      throw new Error(errorMessage);
    } finally {
      activeCheck = null;
    }
  })();

  return activeCheck;
}

export async function downloadUpdate(): Promise<void> {
  if (activeDownload) return activeDownload;
  if (!activeUpdate) {
    throw new Error("No update is available to download.");
  }

  activeDownload = (async () => {
    try {
      pendingRestartOnly = false;
      setSnapshot({
        state: "downloading",
        error: null,
        downloadProgress: 0,
        downloadedBytes: 0,
        totalBytes: null,
      });

      await activeUpdate.download((event) => {
        updateDownloadProgress(event);
      });

      setSnapshot({
        state: "readyToRestart",
        error: null,
        downloadProgress: 100,
      });

      void logInfo(`update_downloaded latest=${snapshot.latestVersion ?? "unknown"}`);
    } catch (value) {
      const errorMessage = mapUpdaterError(value);
      setSnapshot({
        state: "error",
        error: errorMessage,
        downloadProgress: null,
      });
      void logError(`update_download_failed message=${toErrorMessage(value)}`);
      throw new Error(errorMessage);
    } finally {
      activeDownload = null;
    }
  })();

  return activeDownload;
}

export async function installUpdate(): Promise<void> {
  if (pendingRestartOnly) {
    try {
      await relaunch();
      return;
    } catch (value) {
      const errorMessage = mapUpdaterError(value);
      setSnapshot({
        state: "readyToRestart",
        error: errorMessage,
        downloadProgress: null,
      });
      void logError(`update_restart_failed message=${toErrorMessage(value)}`);
      throw new Error(errorMessage);
    }
  }

  if (!activeUpdate) {
    throw new Error("No downloaded update is ready to install.");
  }

  try {
    void logInfo(`update_install_started latest=${snapshot.latestVersion ?? "unknown"}`);
    await activeUpdate.install();
    pendingRestartOnly = true;
    activeUpdate = null;
    void logInfo("update_install_triggered");
    await relaunch();
  } catch (value) {
    const errorMessage = mapUpdaterError(value);
    setSnapshot({
      state: "readyToRestart",
      error: errorMessage,
      downloadProgress: null,
    });
    void logError(`update_install_or_restart_failed message=${toErrorMessage(value)}`);
    throw new Error(errorMessage);
  }
}

export async function downloadAndInstallUpdate(): Promise<void> {
  await downloadUpdate();
  await installUpdate();
}
