import { FolderOpen, FolderSearch } from "lucide-react";
import { cn } from "@/lib/utils";
import { type Settings } from "@/stores/settings";
import { type SettingsPatch } from "@/stores/settingsStore";

interface WindowSectionProps {
  settings: Settings;
  defaultNotesDirectory: string;
  effectiveNotesDirectory: string;
  notesDirectoryBusy: boolean;
  notesDirectoryError: string | null;
  startupBusy: boolean;
  startupError: string | null;
  taskbarBusy: boolean;
  taskbarError: string | null;
  contextMenuBusy: boolean;
  contextMenuError: string | null;
  defaultOpenBusy: boolean;
  defaultOpenError: string | null;
  updateSettings: (patch: SettingsPatch) => void;
  setNotesDirectoryError: (value: string | null) => void;
  onChooseNotesDirectory: () => Promise<void>;
  onOpenNotesDirectory: () => Promise<void>;
  onLaunchAtStartup: () => Promise<void>;
  onTaskbarVisibility: () => Promise<void>;
  onContextMenuIntegration: () => Promise<void>;
  onDefaultOpenIntegration: () => Promise<void>;
}

export function WindowSection({
  settings,
  defaultNotesDirectory,
  effectiveNotesDirectory,
  notesDirectoryBusy,
  notesDirectoryError,
  startupBusy,
  startupError,
  taskbarBusy,
  taskbarError,
  contextMenuBusy,
  contextMenuError,
  defaultOpenBusy,
  defaultOpenError,
  updateSettings,
  setNotesDirectoryError,
  onChooseNotesDirectory,
  onOpenNotesDirectory,
  onLaunchAtStartup,
  onTaskbarVisibility,
  onContextMenuIntegration,
  onDefaultOpenIntegration,
}: WindowSectionProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-md border border-border bg-background/60 p-3 text-xs text-muted-foreground">
        Always-on-top state is independent per note window. Use middle click or shortcut in each
        note to toggle.
      </div>

      <div className="flex flex-col gap-2 rounded-md border border-border bg-background/60 p-3">
        <div className="text-xs font-medium text-muted-foreground">New Note Directory</div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={settings.newNoteDirectory}
            onChange={(event) => {
              updateSettings({ newNoteDirectory: event.target.value });
              setNotesDirectoryError(null);
            }}
            placeholder={defaultNotesDirectory || "Loading default directory..."}
            disabled={notesDirectoryBusy}
            className={cn(
              "h-8 flex-1 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none transition-colors focus:border-primary",
              notesDirectoryBusy && "cursor-not-allowed opacity-60",
            )}
          />
          <button
            type="button"
            onClick={() => {
              void onChooseNotesDirectory();
            }}
            disabled={notesDirectoryBusy}
            className={cn(
              "inline-flex h-8 w-8 items-center justify-center rounded-md border text-muted-foreground transition-colors",
              "border-border bg-background text-muted-foreground hover:bg-accent",
              notesDirectoryBusy && "cursor-not-allowed opacity-60",
            )}
            aria-label="Choose directory"
            title="Choose directory"
          >
            <FolderSearch className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={notesDirectoryBusy || !effectiveNotesDirectory}
            onClick={() => {
              void onOpenNotesDirectory();
            }}
            className={cn(
              "inline-flex h-8 w-8 items-center justify-center rounded-md border text-muted-foreground transition-colors",
              "border-border bg-background text-muted-foreground hover:bg-accent",
              (notesDirectoryBusy || !effectiveNotesDirectory) && "cursor-not-allowed opacity-60",
            )}
            aria-label="Open directory"
            title="Open directory"
          >
            <FolderOpen className="h-4 w-4" />
          </button>
        </div>
        {notesDirectoryError && (
          <div className="text-xs text-destructive">{notesDirectoryError}</div>
        )}
      </div>

      <div className="flex items-center justify-between rounded-md border border-border bg-background/60 p-3">
        <div className="text-xs font-medium text-muted-foreground">Launch At Startup</div>
        <button
          type="button"
          disabled={startupBusy}
          onClick={() => {
            void onLaunchAtStartup();
          }}
          className={cn(
            "rounded-md border px-2 py-1 text-xs font-medium transition-colors",
            settings.launchAtStartup
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background text-muted-foreground hover:bg-accent",
            startupBusy && "cursor-not-allowed opacity-60",
          )}
        >
          {settings.launchAtStartup ? "Enabled" : "Disabled"}
        </button>
      </div>

      {startupError && <div className="text-xs text-destructive">{startupError}</div>}

      <div className="flex items-center justify-between rounded-md border border-border bg-background/60 p-3">
        <div className="flex flex-col gap-1">
          <div className="text-xs font-medium text-muted-foreground">
            Hide Note Windows From Taskbar
          </div>
          <div className="text-[11px] text-muted-foreground">
            Control whether note windows are hidden from the system taskbar.
          </div>
        </div>
        <button
          type="button"
          disabled={taskbarBusy}
          onClick={() => {
            void onTaskbarVisibility();
          }}
          className={cn(
            "rounded-md border px-2 py-1 text-xs font-medium transition-colors",
            settings.hideNoteWindowsFromTaskbar
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background text-muted-foreground hover:bg-accent",
            taskbarBusy && "cursor-not-allowed opacity-60",
          )}
        >
          {settings.hideNoteWindowsFromTaskbar ? "Enabled" : "Disabled"}
        </button>
      </div>

      {taskbarError && <div className="text-xs text-destructive">{taskbarError}</div>}

      <div className="flex items-center justify-between rounded-md border border-border bg-background/60 p-3">
        <div className="flex flex-col gap-1">
          <div className="text-xs font-medium text-muted-foreground">
            Context Menu Follows Note Opacity
          </div>
          <div className="text-[11px] text-muted-foreground">
            Use note opacity for the context menu background.
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            updateSettings({
              contextMenuFollowNoteOpacity: !settings.contextMenuFollowNoteOpacity,
            });
          }}
          className={cn(
            "rounded-md border px-2 py-1 text-xs font-medium transition-colors",
            settings.contextMenuFollowNoteOpacity
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background text-muted-foreground hover:bg-accent",
          )}
        >
          {settings.contextMenuFollowNoteOpacity ? "Enabled" : "Disabled"}
        </button>
      </div>

      <div className="flex items-center justify-between rounded-md border border-border bg-background/60 p-3">
        <div className="flex flex-col gap-1">
          <div className="text-xs font-medium text-muted-foreground">Explorer Context Menu</div>
          <div className="text-[11px] text-muted-foreground">
            Adds "Use Pinote to Open" for .md and .markdown files.
          </div>
        </div>
        <button
          type="button"
          disabled={contextMenuBusy}
          onClick={() => {
            void onContextMenuIntegration();
          }}
          className={cn(
            "rounded-md border px-2 py-1 text-xs font-medium transition-colors",
            settings.openWithPinoteContextMenu
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background text-muted-foreground hover:bg-accent",
            contextMenuBusy && "cursor-not-allowed opacity-60",
          )}
        >
          {settings.openWithPinoteContextMenu ? "Enabled" : "Disabled"}
        </button>
      </div>

      {contextMenuError && <div className="text-xs text-destructive">{contextMenuError}</div>}

      <div className="flex items-center justify-between rounded-md border border-border bg-background/60 p-3">
        <div className="flex flex-col gap-1">
          <div className="text-xs font-medium text-muted-foreground">Default Markdown Opener</div>
          <div className="text-[11px] text-muted-foreground">
            Set Pinote as default opener for .md and .markdown files.
          </div>
        </div>
        <button
          type="button"
          disabled={defaultOpenBusy}
          onClick={() => {
            void onDefaultOpenIntegration();
          }}
          className={cn(
            "rounded-md border px-2 py-1 text-xs font-medium transition-colors",
            settings.defaultMarkdownOpenWithPinote
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background text-muted-foreground hover:bg-accent",
            defaultOpenBusy && "cursor-not-allowed opacity-60",
          )}
        >
          {settings.defaultMarkdownOpenWithPinote ? "Enabled" : "Disabled"}
        </button>
      </div>

      {defaultOpenError && <div className="text-xs text-destructive">{defaultOpenError}</div>}
    </div>
  );
}
