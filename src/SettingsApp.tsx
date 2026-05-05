import { useCallback, useEffect, useState } from "react";
import { exists, mkdir } from "@tauri-apps/plugin-fs";
import { getVersion } from "@tauri-apps/api/app";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { AboutSection } from "@/components/settings/AboutSection";
import { AppearanceSection } from "@/components/settings/AppearanceSection";
import { HistorySection } from "@/components/settings/HistorySection";
import { SettingsSidebar } from "@/components/settings/SettingsSidebar";
import { ShortcutsSection } from "@/components/settings/ShortcutsSection";
import {
  dragMouseButtonOptions,
  sections,
  type GlobalShortcutKey,
  type SettingsSection,
  type ShortcutKey,
  wheelResizeModifierOptions,
} from "@/components/settings/shared";
import { WindowSection } from "@/components/settings/WindowSection";
import { useSettings } from "@/hooks/useSettings";
import { useTheme } from "@/hooks/useTheme";
import { TitleBar } from "@/components/TitleBar";
import { normalizeShortcut } from "@/lib/shortcuts";
import { resolveDefaultNotesDirectory } from "@/lib/notes";
import { searchNoteHistory, type NoteHistorySearchResult } from "@/lib/noteHistory";
import {
  bringNoteWindowsBackOnScreen,
  getRuntimePlatform,
  getDefaultMarkdownOpenEnabled,
  getOpenWithPinoteEnabled,
  setGlobalShortcuts,
  setNoteWindowsSkipTaskbar,
  setDefaultMarkdownOpenEnabled,
  setOpenWithPinoteEnabled,
  type RuntimePlatform,
} from "@/lib/windowApi";
import { openAndTrackNoteWindow } from "@/lib/windowManager";
import {
  checkForUpdates,
  downloadUpdate,
  getUpdateState,
  installUpdate,
  subscribeUpdateState,
  type UpdateSnapshot,
} from "@/lib/updater";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";

const REPOSITORY_URL = "https://github.com/ImFeH2/pinote";
const HISTORY_SEARCH_LIMIT = 80;
const HISTORY_SEARCH_DEBOUNCE_MS = 120;
const emptyGlobalShortcutRegistration: Record<GlobalShortcutKey, boolean | null> = {
  newNote: null,
  restoreWindow: null,
  showAllHiddenWindows: null,
  toggleVisibleWindows: null,
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getUpdateStatusText(snapshot: UpdateSnapshot) {
  if (snapshot.state === "idle") return "No update check has been run yet.";
  if (snapshot.state === "checking") return "Checking for updates...";
  if (snapshot.state === "available") {
    return `Update ${snapshot.latestVersion ?? "unknown"} is available.`;
  }
  if (snapshot.state === "upToDate") return "You are using the latest stable release.";
  if (snapshot.state === "downloading") {
    if (snapshot.downloadProgress !== null) {
      return `Downloading update... ${snapshot.downloadProgress}%`;
    }
    return "Downloading update...";
  }
  if (snapshot.state === "readyToRestart") {
    return "Download complete. Restart to install the update.";
  }
  if (snapshot.state === "error") return snapshot.error ?? "Update failed.";
  return "Update status is unavailable.";
}

export function SettingsApp() {
  useTheme();
  const { settings, updateSettings } = useSettings();
  const [activeSection, setActiveSection] = useState<SettingsSection>("appearance");
  const [shortcutError, setShortcutError] = useState<string | null>(null);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [startupBusy, setStartupBusy] = useState(false);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [updateActionError, setUpdateActionError] = useState<string | null>(null);
  const [updateSnapshot, setUpdateSnapshot] = useState<UpdateSnapshot>(() => getUpdateState());
  const [appVersion, setAppVersion] = useState("loading...");
  const [aboutError, setAboutError] = useState<string | null>(null);
  const [notesDirectoryError, setNotesDirectoryError] = useState<string | null>(null);
  const [notesDirectoryBusy, setNotesDirectoryBusy] = useState(false);
  const [defaultNotesDirectory, setDefaultNotesDirectory] = useState("");
  const [contextMenuBusy, setContextMenuBusy] = useState(false);
  const [contextMenuError, setContextMenuError] = useState<string | null>(null);
  const [defaultOpenBusy, setDefaultOpenBusy] = useState(false);
  const [defaultOpenError, setDefaultOpenError] = useState<string | null>(null);
  const [taskbarBusy, setTaskbarBusy] = useState(false);
  const [taskbarError, setTaskbarError] = useState<string | null>(null);
  const [bringNotesBackBusy, setBringNotesBackBusy] = useState(false);
  const [bringNotesBackError, setBringNotesBackError] = useState<string | null>(null);
  const [bringNotesBackResult, setBringNotesBackResult] = useState<string | null>(null);
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyResults, setHistoryResults] = useState<NoteHistorySearchResult[]>([]);
  const [historyOpeningPath, setHistoryOpeningPath] = useState<string | null>(null);
  const [historyReloadToken, setHistoryReloadToken] = useState(0);
  const [runtimePlatform, setRuntimePlatform] = useState<RuntimePlatform>("other");
  const [globalShortcutRegistration, setGlobalShortcutRegistration] = useState<{
    signature: string;
    values: Record<GlobalShortcutKey, boolean | null>;
  } | null>(null);

  const activeSectionInfo = sections.find((section) => section.id === activeSection) ?? sections[0];
  const lineHeightText = settings.editorLineHeight.toFixed(1);
  const paddingXText = `${settings.editorPaddingX}px`;
  const paddingYText = `${settings.editorPaddingY}px`;
  const canDownloadUpdate =
    updateSnapshot.state === "available" ||
    (updateSnapshot.available && updateSnapshot.state === "error");
  const canInstallUpdate = updateSnapshot.state === "readyToRestart";
  const updateStatusText = getUpdateStatusText(updateSnapshot);
  const updateError = updateActionError ?? updateSnapshot.error;
  const isCheckingUpdate = updateSnapshot.state === "checking";
  const isDownloadingUpdate = updateSnapshot.state === "downloading";
  const activeWheelResizeModifier =
    wheelResizeModifierOptions.find((item) => item.value === settings.wheelResizeModifier) ??
    wheelResizeModifierOptions[0];
  const activeWheelOpacityModifier =
    wheelResizeModifierOptions.find((item) => item.value === settings.wheelOpacityModifier) ??
    wheelResizeModifierOptions[1];
  const activeDragMouseButton =
    dragMouseButtonOptions.find((item) => item.value === settings.dragMouseButton) ??
    dragMouseButtonOptions[0];
  const customNotesDirectory = settings.newNoteDirectory.trim();
  const effectiveNotesDirectory = customNotesDirectory || defaultNotesDirectory;
  const globalShortcutRegistrationSignature = [
    settings.shortcuts.newNote,
    settings.shortcuts.restoreWindow,
    settings.shortcuts.showAllHiddenWindows,
    settings.shortcuts.toggleVisibleWindows,
  ].join("\n");
  const displayedGlobalShortcutRegistration =
    activeSection !== "shortcuts" ||
    globalShortcutRegistration?.signature !== globalShortcutRegistrationSignature
      ? emptyGlobalShortcutRegistration
      : globalShortcutRegistration.values;

  const updateShortcut = useCallback(
    (key: ShortcutKey, value: string) => {
      const normalized = normalizeShortcut(value);
      if (!normalized) {
        setShortcutError("Invalid shortcut.");
        return;
      }

      setShortcutError(null);
      updateSettings({
        shortcuts: {
          [key]: normalized,
        },
      });
    },
    [updateSettings],
  );

  useEffect(() => {
    if (activeSection !== "shortcuts") return;
    let cancelled = false;
    const signature = globalShortcutRegistrationSignature;
    const refresh = async () => {
      try {
        const snapshot = await setGlobalShortcuts({
          newNote: settings.shortcuts.newNote,
          restoreWindow: settings.shortcuts.restoreWindow,
          showAllHiddenWindows: settings.shortcuts.showAllHiddenWindows,
          toggleVisibleWindows: settings.shortcuts.toggleVisibleWindows,
        });
        if (cancelled) return;
        setGlobalShortcutRegistration({
          signature,
          values: {
            newNote: snapshot.newNote,
            restoreWindow: snapshot.restoreWindow,
            showAllHiddenWindows: snapshot.showAllHiddenWindows,
            toggleVisibleWindows: snapshot.toggleVisibleWindows,
          },
        });
      } catch {
        if (cancelled) return;
        setGlobalShortcutRegistration({
          signature,
          values: emptyGlobalShortcutRegistration,
        });
      }
    };
    void refresh();
    return () => {
      cancelled = true;
    };
  }, [
    activeSection,
    globalShortcutRegistrationSignature,
    settings.shortcuts.newNote,
    settings.shortcuts.restoreWindow,
    settings.shortcuts.showAllHiddenWindows,
    settings.shortcuts.toggleVisibleWindows,
  ]);

  const handleLaunchAtStartup = useCallback(async () => {
    const next = !settings.launchAtStartup;
    setStartupBusy(true);
    try {
      if (next) {
        await enable();
      } else {
        await disable();
      }
      setStartupError(null);
      updateSettings({ launchAtStartup: next });
    } catch (error) {
      setStartupError(getErrorMessage(error));
    } finally {
      setStartupBusy(false);
    }
  }, [settings.launchAtStartup, updateSettings]);

  const handleContextMenuIntegration = useCallback(async () => {
    const next = !settings.openWithPinoteContextMenu;
    setContextMenuBusy(true);
    try {
      const enabled = await setOpenWithPinoteEnabled(next);
      updateSettings({ openWithPinoteContextMenu: enabled });
      setContextMenuError(null);
    } catch (error) {
      setContextMenuError(getErrorMessage(error));
    } finally {
      setContextMenuBusy(false);
    }
  }, [settings.openWithPinoteContextMenu, updateSettings]);

  const handleDefaultOpenIntegration = useCallback(async () => {
    const next = !settings.defaultMarkdownOpenWithPinote;
    setDefaultOpenBusy(true);
    try {
      const enabled = await setDefaultMarkdownOpenEnabled(next);
      updateSettings({ defaultMarkdownOpenWithPinote: enabled });
      setDefaultOpenError(null);
    } catch (error) {
      setDefaultOpenError(getErrorMessage(error));
    } finally {
      setDefaultOpenBusy(false);
    }
  }, [settings.defaultMarkdownOpenWithPinote, updateSettings]);

  const handleTaskbarVisibility = useCallback(async () => {
    const next = !settings.hideNoteWindowsFromTaskbar;
    setTaskbarBusy(true);
    try {
      await setNoteWindowsSkipTaskbar(next);
      updateSettings({ hideNoteWindowsFromTaskbar: next });
      setTaskbarError(null);
    } catch (error) {
      setTaskbarError(getErrorMessage(error));
    } finally {
      setTaskbarBusy(false);
    }
  }, [settings.hideNoteWindowsFromTaskbar, updateSettings]);

  const handleBringNotesBack = useCallback(async () => {
    setBringNotesBackBusy(true);
    setBringNotesBackError(null);
    setBringNotesBackResult(null);
    try {
      const moved = await bringNoteWindowsBackOnScreen();
      setBringNotesBackResult(
        moved > 0
          ? `Moved ${moved} ${moved === 1 ? "note" : "notes"} back.`
          : "All notes are already on screen.",
      );
    } catch (error) {
      setBringNotesBackError(getErrorMessage(error));
    } finally {
      setBringNotesBackBusy(false);
    }
  }, []);

  const handleManualUpdateCheck = useCallback(async () => {
    setUpdateBusy(true);
    setUpdateActionError(null);
    try {
      await checkForUpdates("manual");
    } catch (error) {
      setUpdateActionError(getErrorMessage(error));
    } finally {
      setUpdateBusy(false);
    }
  }, []);

  const handleDownloadUpdate = useCallback(async () => {
    setUpdateBusy(true);
    setUpdateActionError(null);
    try {
      await downloadUpdate();
    } catch (error) {
      setUpdateActionError(getErrorMessage(error));
    } finally {
      setUpdateBusy(false);
    }
  }, []);

  const handleInstallUpdate = useCallback(async () => {
    setUpdateBusy(true);
    setUpdateActionError(null);
    try {
      await installUpdate();
    } catch (error) {
      setUpdateActionError(getErrorMessage(error));
    } finally {
      setUpdateBusy(false);
    }
  }, []);

  const handleOpenRepository = useCallback(async () => {
    try {
      await openUrl(REPOSITORY_URL);
      setAboutError(null);
    } catch (error) {
      setAboutError(getErrorMessage(error));
    }
  }, []);

  const handleChooseNotesDirectory = useCallback(async () => {
    setNotesDirectoryBusy(true);
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        defaultPath: effectiveNotesDirectory || undefined,
      });
      const selectedPath = Array.isArray(selected) ? selected[0] : selected;
      if (typeof selectedPath !== "string" || !selectedPath.trim()) return;
      updateSettings({ newNoteDirectory: selectedPath.trim() });
      setNotesDirectoryError(null);
    } catch (error) {
      setNotesDirectoryError(getErrorMessage(error));
    } finally {
      setNotesDirectoryBusy(false);
    }
  }, [effectiveNotesDirectory, updateSettings]);

  const handleOpenNotesDirectory = useCallback(async () => {
    const targetDirectory = effectiveNotesDirectory.trim();
    if (!targetDirectory) return;
    setNotesDirectoryBusy(true);
    try {
      if (!customNotesDirectory) {
        const directoryExists = await exists(targetDirectory);
        if (!directoryExists) {
          await mkdir(targetDirectory, { recursive: true });
        }
      }
      await openPath(targetDirectory);
      setNotesDirectoryError(null);
    } catch (error) {
      setNotesDirectoryError(getErrorMessage(error));
    } finally {
      setNotesDirectoryBusy(false);
    }
  }, [customNotesDirectory, effectiveNotesDirectory]);

  const handleOpenHistoryItem = useCallback(async (item: NoteHistorySearchResult) => {
    const notePath = item.notePath.trim();
    if (!notePath) return;
    setHistoryOpeningPath(notePath);
    try {
      await openAndTrackNoteWindow({
        noteId: item.noteId,
        notePath,
        windowId: item.windowId.trim() || undefined,
        visibility: "visible",
        focus: true,
      });
      setHistoryError(null);
      setHistoryReloadToken((value) => value + 1);
    } catch (error) {
      setHistoryError(getErrorMessage(error));
    } finally {
      setHistoryOpeningPath(null);
    }
  }, []);

  useEffect(() => {
    let active = true;
    isEnabled()
      .then((enabled) => {
        if (!active) return;
        updateSettings({ launchAtStartup: enabled });
      })
      .catch((error) => {
        if (!active) return;
        setStartupError(getErrorMessage(error));
      });
    return () => {
      active = false;
    };
  }, [updateSettings]);

  useEffect(() => {
    let active = true;
    getOpenWithPinoteEnabled()
      .then((enabled) => {
        if (!active) return;
        if (settings.openWithPinoteContextMenu === enabled) return;
        updateSettings({ openWithPinoteContextMenu: enabled });
      })
      .catch((error) => {
        if (!active) return;
        setContextMenuError(getErrorMessage(error));
      });
    return () => {
      active = false;
    };
  }, [settings.openWithPinoteContextMenu, updateSettings]);

  useEffect(() => {
    let active = true;
    getDefaultMarkdownOpenEnabled()
      .then((enabled) => {
        if (!active) return;
        if (settings.defaultMarkdownOpenWithPinote === enabled) return;
        updateSettings({ defaultMarkdownOpenWithPinote: enabled });
      })
      .catch((error) => {
        if (!active) return;
        setDefaultOpenError(getErrorMessage(error));
      });
    return () => {
      active = false;
    };
  }, [settings.defaultMarkdownOpenWithPinote, updateSettings]);

  useEffect(() => {
    let active = true;
    resolveDefaultNotesDirectory()
      .then((directory) => {
        if (!active) return;
        setDefaultNotesDirectory(directory);
      })
      .catch((error) => {
        if (!active) return;
        setNotesDirectoryError(getErrorMessage(error));
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (activeSection !== "history") return;
    let active = true;
    const timer = window.setTimeout(() => {
      setHistoryLoading(true);
      searchNoteHistory(historyQuery, { limit: HISTORY_SEARCH_LIMIT })
        .then((results) => {
          if (!active) return;
          setHistoryResults(results);
          setHistoryError(null);
        })
        .catch((error) => {
          if (!active) return;
          setHistoryError(getErrorMessage(error));
        })
        .finally(() => {
          if (!active) return;
          setHistoryLoading(false);
        });
    }, HISTORY_SEARCH_DEBOUNCE_MS);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [activeSection, historyQuery, historyReloadToken]);

  useEffect(() => {
    return subscribeUpdateState((next) => {
      setUpdateSnapshot(next);
    });
  }, []);

  useEffect(() => {
    if (!settings.lastUpdateCheckAt && updateSnapshot.state === "idle") {
      checkForUpdates("silent").catch(() => {});
    }
  }, [settings.lastUpdateCheckAt, updateSnapshot.state]);

  useEffect(() => {
    if (!updateSnapshot.lastCheckedAt) return;
    if (settings.lastUpdateCheckAt === updateSnapshot.lastCheckedAt) return;
    updateSettings({ lastUpdateCheckAt: updateSnapshot.lastCheckedAt });
  }, [settings.lastUpdateCheckAt, updateSettings, updateSnapshot.lastCheckedAt]);

  useEffect(() => {
    let active = true;
    getVersion()
      .then((version) => {
        if (!active) return;
        setAppVersion(version);
      })
      .catch(() => {
        if (!active) return;
        setAppVersion("unknown");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    getRuntimePlatform()
      .then((platform) => {
        if (!active) return;
        setRuntimePlatform(platform);
      })
      .catch(() => {
        if (!active) return;
        setRuntimePlatform("other");
      });
    return () => {
      active = false;
    };
  }, []);

  const sectionContent =
    activeSection === "appearance" ? (
      <AppearanceSection
        settings={settings}
        runtimePlatform={runtimePlatform}
        lineHeightText={lineHeightText}
        paddingXText={paddingXText}
        paddingYText={paddingYText}
        updateSettings={updateSettings}
      />
    ) : activeSection === "window" ? (
      <WindowSection
        settings={settings}
        defaultNotesDirectory={defaultNotesDirectory}
        effectiveNotesDirectory={effectiveNotesDirectory}
        notesDirectoryBusy={notesDirectoryBusy}
        notesDirectoryError={notesDirectoryError}
        startupBusy={startupBusy}
        startupError={startupError}
        taskbarBusy={taskbarBusy}
        taskbarError={taskbarError}
        bringNotesBackBusy={bringNotesBackBusy}
        bringNotesBackError={bringNotesBackError}
        bringNotesBackResult={bringNotesBackResult}
        contextMenuBusy={contextMenuBusy}
        contextMenuError={contextMenuError}
        defaultOpenBusy={defaultOpenBusy}
        defaultOpenError={defaultOpenError}
        updateSettings={updateSettings}
        setNotesDirectoryError={setNotesDirectoryError}
        onChooseNotesDirectory={handleChooseNotesDirectory}
        onOpenNotesDirectory={handleOpenNotesDirectory}
        onLaunchAtStartup={handleLaunchAtStartup}
        onTaskbarVisibility={handleTaskbarVisibility}
        onBringNotesBack={handleBringNotesBack}
        onContextMenuIntegration={handleContextMenuIntegration}
        onDefaultOpenIntegration={handleDefaultOpenIntegration}
      />
    ) : activeSection === "history" ? (
      <HistorySection
        historyQuery={historyQuery}
        historyLoading={historyLoading}
        historyResults={historyResults}
        historyOpeningPath={historyOpeningPath}
        historyError={historyError}
        setHistoryQuery={setHistoryQuery}
        onOpenHistoryItem={handleOpenHistoryItem}
        formatDateTime={formatDateTime}
      />
    ) : activeSection === "shortcuts" ? (
      <ShortcutsSection
        settings={settings}
        shortcutError={shortcutError}
        globalShortcutRegistration={displayedGlobalShortcutRegistration}
        activeWheelResizeModifier={activeWheelResizeModifier}
        activeWheelOpacityModifier={activeWheelOpacityModifier}
        activeDragMouseButton={activeDragMouseButton}
        updateShortcut={updateShortcut}
        updateSettings={updateSettings}
      />
    ) : (
      <AboutSection
        appVersion={appVersion}
        updateBusy={updateBusy}
        isCheckingUpdate={isCheckingUpdate}
        isDownloadingUpdate={isDownloadingUpdate}
        updateStatusText={updateStatusText}
        updateSnapshot={updateSnapshot}
        canDownloadUpdate={canDownloadUpdate}
        canInstallUpdate={canInstallUpdate}
        settings={settings}
        updateError={updateError}
        aboutError={aboutError}
        repositoryUrl={REPOSITORY_URL}
        formatDateTime={formatDateTime}
        onManualUpdateCheck={handleManualUpdateCheck}
        onDownloadUpdate={handleDownloadUpdate}
        onInstallUpdate={handleInstallUpdate}
        onOpenRepository={handleOpenRepository}
      />
    );

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <TitleBar title="Settings" showSettings={false} />

      <div className="flex min-h-0 flex-1">
        <SettingsSidebar activeSection={activeSection} onSelect={setActiveSection} />

        <main className="pinote-scrollbar min-w-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-4">
            <div className="text-sm font-semibold text-foreground">{activeSectionInfo.label}</div>
            <div className="text-xs text-muted-foreground">{activeSectionInfo.description}</div>
          </div>
          {sectionContent}
        </main>
      </div>
    </div>
  );
}
