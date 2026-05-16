import { Download, RefreshCw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { type UpdateSnapshot } from "@/lib/updater";

interface UpdateDialogProps {
  snapshot: UpdateSnapshot;
  busy: boolean;
  error: string | null;
  onDownload: () => Promise<void>;
  onInstall: () => Promise<void>;
  onLater: () => void;
}

export function UpdateDialog({
  snapshot,
  busy,
  error,
  onDownload,
  onInstall,
  onLater,
}: UpdateDialogProps) {
  const latestVersion = snapshot.latestVersion ?? "unknown";
  const currentVersion = snapshot.currentVersion || "unknown";
  const isDownloading = snapshot.state === "downloading";
  const isReady = snapshot.state === "readyToRestart";
  const actionDisabled = busy || snapshot.state === "checking";
  const progressText =
    isDownloading && snapshot.downloadProgress !== null
      ? `Downloading ${snapshot.downloadProgress}%`
      : "Download the update when you are ready.";

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/72 p-5 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-lg border border-border bg-background p-4 shadow-xl">
        <div className="mb-3 flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary">
            <Download size={17} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-foreground">Update available</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {`Pinote ${latestVersion} is ready. You are using ${currentVersion}.`}
            </div>
          </div>
          <button
            type="button"
            aria-label="Later"
            disabled={busy || isDownloading}
            onClick={onLater}
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent",
              (busy || isDownloading) && "cursor-not-allowed opacity-60",
            )}
          >
            <X size={15} />
          </button>
        </div>

        <div className="mb-4 text-xs text-muted-foreground">
          {error ?? (isReady ? "Restart Pinote to finish installing the update." : progressText)}
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={busy || isDownloading}
            onClick={onLater}
            className={cn(
              "rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent",
              (busy || isDownloading) && "cursor-not-allowed opacity-60",
            )}
          >
            Later
          </button>
          <button
            type="button"
            disabled={actionDisabled || isDownloading}
            onClick={() => {
              void (isReady ? onInstall() : onDownload());
            }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border border-primary bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90",
              (actionDisabled || isDownloading) && "cursor-not-allowed opacity-60",
            )}
          >
            {isReady ? <RefreshCw size={14} /> : <Download size={14} />}
            <span>{isReady ? "Restart" : isDownloading ? "Downloading" : "Download"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
