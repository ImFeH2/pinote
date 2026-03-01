import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { restoreWindowsFromCacheOrCreateNew } from "@/lib/windowManager";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

export function BootstrapApp() {
  const [bootError, setBootError] = useState<string | null>(null);
  const didBootstrap = useRef(false);

  useEffect(() => {
    if (didBootstrap.current) return;
    didBootstrap.current = true;

    let disposed = false;
    const bootstrap = async () => {
      try {
        await restoreWindowsFromCacheOrCreateNew();
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
    };
  }, []);

  return (
    <div className="flex h-screen items-center justify-center bg-background text-foreground">
      <div className="text-sm text-muted-foreground">
        {bootError ? `Startup failed: ${bootError}` : "Launching..."}
      </div>
    </div>
  );
}
