import { Github } from "lucide-react";
import { cn } from "@/lib/utils";
import { type UpdateSnapshot } from "@/lib/updater";
import { type Settings } from "@/stores/settings";

interface AboutSectionProps {
  appVersion: string;
  updateBusy: boolean;
  isCheckingUpdate: boolean;
  isDownloadingUpdate: boolean;
  updateStatusText: string;
  updateSnapshot: UpdateSnapshot;
  canDownloadUpdate: boolean;
  canInstallUpdate: boolean;
  settings: Settings;
  updateError: string | null;
  aboutError: string | null;
  repositoryUrl: string;
  formatDateTime: (value: string) => string;
  onManualUpdateCheck: () => Promise<void>;
  onDownloadUpdate: () => Promise<void>;
  onInstallUpdate: () => Promise<void>;
  onOpenRepository: () => Promise<void>;
}

export function AboutSection({
  appVersion,
  updateBusy,
  isCheckingUpdate,
  isDownloadingUpdate,
  updateStatusText,
  updateSnapshot,
  canDownloadUpdate,
  canInstallUpdate,
  settings,
  updateError,
  aboutError,
  repositoryUrl,
  formatDateTime,
  onManualUpdateCheck,
  onDownloadUpdate,
  onInstallUpdate,
  onOpenRepository,
}: AboutSectionProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-md border border-border bg-background/60 p-3">
        <div className="text-xs font-medium text-muted-foreground">Application</div>
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">Name</div>
          <div className="text-xs font-medium text-foreground">Pinote</div>
        </div>
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">Current Version</div>
          <div className="text-xs font-medium text-foreground">{appVersion}</div>
        </div>
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">Release Channel</div>
          <div className="text-xs font-medium text-foreground">Stable</div>
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-md border border-border bg-background/60 p-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium text-muted-foreground">Updates</div>
          <button
            type="button"
            disabled={updateBusy || isCheckingUpdate || isDownloadingUpdate}
            onClick={() => {
              void onManualUpdateCheck();
            }}
            className={cn(
              "rounded-md border px-2 py-1 text-xs font-medium transition-colors",
              "border-border bg-background text-muted-foreground hover:bg-accent",
              (updateBusy || isCheckingUpdate || isDownloadingUpdate) &&
                "cursor-not-allowed opacity-60",
            )}
          >
            {isCheckingUpdate ? "Checking..." : "Check Updates"}
          </button>
        </div>

        <div className="text-xs text-muted-foreground">{updateStatusText}</div>

        {updateSnapshot.latestVersion && (
          <div className="text-xs text-muted-foreground">
            {`Current ${updateSnapshot.currentVersion || "unknown"} -> Latest ${updateSnapshot.latestVersion}`}
          </div>
        )}

        {isDownloadingUpdate && updateSnapshot.downloadProgress !== null && (
          <div className="text-xs text-muted-foreground">{`Progress ${updateSnapshot.downloadProgress}%`}</div>
        )}

        {canDownloadUpdate && (
          <button
            type="button"
            disabled={updateBusy || isDownloadingUpdate || isCheckingUpdate}
            onClick={() => {
              void onDownloadUpdate();
            }}
            className={cn(
              "rounded-md border px-2 py-1 text-xs font-medium transition-colors",
              "border-primary bg-primary text-primary-foreground hover:opacity-90",
              (updateBusy || isDownloadingUpdate || isCheckingUpdate) &&
                "cursor-not-allowed opacity-60",
            )}
          >
            {isDownloadingUpdate ? "Downloading..." : "Download Update"}
          </button>
        )}

        {canInstallUpdate && (
          <button
            type="button"
            disabled={updateBusy}
            onClick={() => {
              void onInstallUpdate();
            }}
            className={cn(
              "rounded-md border px-2 py-1 text-xs font-medium transition-colors",
              "border-primary bg-primary text-primary-foreground hover:opacity-90",
              updateBusy && "cursor-not-allowed opacity-60",
            )}
          >
            {updateBusy ? "Installing..." : "Restart to Install"}
          </button>
        )}

        {settings.lastUpdateCheckAt && (
          <div className="text-[11px] text-muted-foreground">
            {`Last checked at ${formatDateTime(settings.lastUpdateCheckAt)}`}
          </div>
        )}

        {updateError && <div className="text-xs text-destructive">{updateError}</div>}
      </div>

      <div className="flex flex-col gap-2 rounded-md border border-border bg-background/60 p-3">
        <div className="text-xs font-medium text-muted-foreground">Project</div>
        <button
          type="button"
          onClick={() => {
            void onOpenRepository();
          }}
          className="inline-flex items-center gap-2 self-start rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
        >
          <Github size={14} />
          <span>Pinote</span>
        </button>
        <div className="truncate text-[11px] text-muted-foreground">{repositoryUrl}</div>
      </div>

      {aboutError && <div className="text-xs text-destructive">{aboutError}</div>}
    </div>
  );
}
