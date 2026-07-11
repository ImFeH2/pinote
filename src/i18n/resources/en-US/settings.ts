export default {
  title: "Settings",
  common: {
    enabled: "Enabled",
    disabled: "Disabled",
    loading: "Loading...",
    unknown: "Unknown",
  },
  sections: {
    appearance: {
      label: "Appearance",
      description: "Choose the language, theme, and visual style.",
    },
    window: {
      label: "Window",
      description: "Manage note windows and startup behavior.",
    },
    shortcuts: {
      label: "Shortcuts",
      description: "Customize keyboard shortcuts and mouse interactions.",
    },
    history: {
      label: "History",
      description: "Find and reopen notes you used before.",
    },
    about: {
      label: "About",
      description: "View the version, updates, and project resources.",
    },
  },
  appearance: {
    language: {
      label: "Language",
      options: {
        system: "Follow system",
        enUS: "English",
        zhCN: "Simplified Chinese",
      },
    },
    theme: {
      label: "Theme",
      options: {
        system: "System",
        light: "Light",
        dark: "Dark",
      },
    },
    typography: {
      label: "Typography",
      fontFamily: "Font family",
      fontSize: "Font size",
      lineHeight: "Line height",
      fontFamilyOptions: {
        system: "System",
        serif: "Serif",
        mono: "Monospace",
      },
    },
    glass: {
      label: "Glass effect",
      enable: "Use glass effect",
      allNotes: "Applies to all note windows.",
      options: {
        mica: "Mica",
        acrylic: "Acrylic",
        blur: "Blur",
      },
    },
    spacing: {
      label: "Page spacing",
      horizontal: "Horizontal margin",
      vertical: "Vertical margin",
    },
  },
  window: {
    alwaysOnTopHelp:
      "Always-on-top is set separately for each note. Use middle click or the note shortcut to change it.",
    lostNotes: {
      label: "Notes outside the screen",
      description: "Move notes that are completely outside the screen back into view.",
      action: "Bring notes back",
      moving: "Moving...",
      moved_one: "Moved {{count}} note back.",
      moved_other: "Moved {{count}} notes back.",
      allVisible: "All notes are already on screen.",
    },
    notesDirectory: {
      label: "New note folder",
      loading: "Loading default folder...",
      choose: "Choose folder",
      open: "Open folder",
    },
    launchAtStartup: "Open Pinote at startup",
    taskbar: {
      label: "Hide note windows from taskbar",
      description: "Keep note windows out of the system taskbar.",
    },
    contextMenuOpacity: {
      label: "Match note opacity in menus",
      description: "Use the note opacity for its menu background.",
    },
    explorerMenu: {
      label: "Open notes from File Explorer",
      description: 'Add "Use Pinote to Open" for .md and .markdown files.',
    },
    defaultOpener: {
      label: "Open Markdown files with Pinote",
      description: "Use Pinote by default when opening .md and .markdown files.",
    },
  },
  shortcuts: {
    keyboard: "Keyboard shortcuts",
    pressKeys: "Press keys...",
    items: {
      newNote: "Create note",
      restoreWindow: "Restore hidden window",
      showAllHiddenWindows: "Show all hidden windows",
      toggleVisibleWindows: "Show or hide visible windows",
      toggleAlwaysOnTop: "Keep note on top",
      toggleReadOnly: "Turn read-only on or off",
      toggleTheme: "Switch theme",
      hideWindow: "Hide window",
      closeWindow: "Close window",
    },
    global: {
      badge: "Global",
      registered: "Shortcut is ready to use anywhere",
      notRegistered: "Shortcut is unavailable",
      checking: "Checking shortcut availability",
      description:
        "Create note, Restore hidden window, Show all hidden windows, and Show or hide visible windows work anywhere. A shortcut is skipped if another app already uses it. The Global badge shows whether it is available.",
    },
    modifiers: {
      alt: "Alt",
      ctrl: "Ctrl",
      shift: "Shift",
      meta: "Meta",
    },
    mouseButtons: {
      middle: "Middle",
      right: "Right",
    },
    wheelResize: {
      label: "Resize modifier",
      description: "{{modifier}} + Wheel resizes the window around the pointer.",
    },
    wheelOpacity: {
      label: "Opacity modifier",
      description: "{{modifier}} + Wheel adjusts window opacity.",
    },
    dragButton: {
      label: "Drag button",
      description: "{{button}} drag moves the window.",
    },
    currentInteractions: {
      label: "Current interactions",
      resize: "{{modifier}} + Wheel: Resize around the pointer",
      opacity: "{{modifier}} + Wheel: Adjust opacity",
      alwaysOnTop: "Middle click: Keep note on top or release it",
      move: "{{button}} drag: Move window",
      rightClickWithDrag: "Right click: Open menu on click or move window on drag",
      rightClick: "Right click: Open menu",
    },
  },
  history: {
    searchPlaceholder: "Search by path or note content",
    searching: "Searching...",
    noResults: "No matching notes.",
    contentMatch: "Content",
    lastOpened: "Last opened: {{date}}",
  },
  about: {
    application: {
      label: "Application",
      name: "Name",
      currentVersion: "Current version",
      releaseChannel: "Release channel",
      stable: "Stable",
    },
    updates: {
      label: "Updates",
      check: "Check for updates",
      checking: "Checking...",
      versions: "Current {{currentVersion}} → Latest {{latestVersion}}",
      progress: "Progress {{progress}}%",
      download: "Download update",
      downloading: "Downloading...",
      restart: "Restart to install",
      installing: "Installing...",
      lastChecked: "Last checked: {{date}}",
    },
    troubleshooting: {
      label: "Troubleshooting",
      description: "The report may include recent file paths and app error details.",
      save: "Save report",
      saving: "Saving...",
    },
    project: "Project",
  },
  updateStatus: {
    idle: "No update check has been run yet.",
    checking: "Checking for updates...",
    available: "Version {{version}} is available.",
    upToDate: "You are using the latest stable release.",
    downloading: "Downloading update...",
    downloadingProgress: "Downloading update... {{progress}}%",
    readyToRestart: "Download complete. Restart to install the update.",
    failed: "Update failed.",
    unavailable: "Update status is unavailable.",
  },
  updateDialog: {
    title: "Update available",
    versions: "Pinote {{latestVersion}} is ready. You are using {{currentVersion}}.",
    readyToDownload: "Download the update when you are ready.",
    downloadingProgress: "Downloading {{progress}}%",
    restartHelp: "Restart Pinote to finish installing the update.",
    later: "Later",
    restart: "Restart",
    downloading: "Downloading",
    download: "Download",
  },
  diagnostics: {
    saved_one: "Report saved with {{count}} file.",
    saved_other: "Report saved with {{count}} files.",
    dialog: {
      title: "Save report",
      zipArchive: "Zip archive",
    },
  },
  errors: {
    unknown: "Something went wrong.",
    invalidShortcut: "Enter a valid shortcut.",
  },
};
