import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useSettings } from "@/hooks/useSettings";
import {
  consumeCliOpenNoteRequests,
  listenCliOpenNoteRequested,
  type CliOpenNoteRequest,
} from "@/lib/api";
import { openCliMarkdownNotes, restoreWindowsFromCacheOrCreateNew } from "@/lib/windowManager";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

export function BootstrapApp() {
  const { settings } = useSettings();
  const [bootError, setBootError] = useState<string | null>(null);
  const didBootstrap = useRef(false);

  useEffect(() => {
    if (didBootstrap.current) return;
    didBootstrap.current = true;

    let disposed = false;
    let unlistenCli: (() => void) | null = null;
    let cliQueue = Promise.resolve();
    const scheduleCliOpen = () => {
      cliQueue = cliQueue
        .then(async () => {
          const requests = await consumeCliOpenNoteRequests();
          if (requests.length === 0) return;
          await openCliMarkdownNotes(requests, {
            skipTaskbar: settings.hideNoteWindowsFromTaskbar,
          });
        })
        .catch((error) => {
          console.error("Failed to process CLI markdown requests:", error);
        });
      return cliQueue;
    };

    const bootstrap = async () => {
      try {
        const initialRequests: CliOpenNoteRequest[] = await consumeCliOpenNoteRequests();
        await restoreWindowsFromCacheOrCreateNew({
          skipCreateWhenEmpty: initialRequests.length > 0,
          skipTaskbar: settings.hideNoteWindowsFromTaskbar,
        });
        if (initialRequests.length > 0) {
          await openCliMarkdownNotes(initialRequests, {
            skipTaskbar: settings.hideNoteWindowsFromTaskbar,
          });
        }
        if (disposed) return;
        unlistenCli = await listenCliOpenNoteRequested(() => {
          void scheduleCliOpen();
        });
        await scheduleCliOpen();
        if (disposed) return;
        await getCurrentWindow().hide();
      } catch (error) {
        if (disposed) return;
        setBootError(getErrorMessage(error));
      }
    };

    void bootstrap();
    return () => {
      disposed = true;
      if (unlistenCli) {
        unlistenCli();
      }
    };
  }, [settings.hideNoteWindowsFromTaskbar]);

  return (
    <div className="flex h-screen items-center justify-center bg-background text-foreground">
      <div className="text-sm text-muted-foreground">
        {bootError ? `Startup failed: ${bootError}` : "Launching..."}
      </div>
    </div>
  );
}
