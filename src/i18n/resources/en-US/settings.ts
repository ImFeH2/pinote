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
      description: "Language, theme, and visual style.",
    },
    window: {
      label: "Window",
      description: "Window and startup behavior.",
    },
    shortcuts: {
      label: "Shortcuts",
      description: "Keyboard shortcuts and mouse actions.",
    },
    history: {
      label: "History",
      description: "Find and reopen notes.",
    },
    about: {
      label: "About",
      description: "Version, updates, and links.",
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
      allNotes: "Applies to all notes.",
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
      label: "Off-screen notes",
      description: "Bring off-screen notes back into view.",
      action: "Bring back",
      moving: "Moving...",
      moved_one: "Moved {{count}} note back.",
      moved_other: "Moved {{count}} notes back.",
      allVisible: "All notes are already on screen.",
    },
    notesDirectory: {
      label: "Note folder",
      loading: "Loading default folder...",
      choose: "Choose folder",
      open: "Open folder",
    },
    launchAtStartup: "Open Pinote at startup",
    taskbar: {
      label: "Hide notes from taskbar",
      description: "Notes won't appear on the taskbar.",
    },
    contextMenuOpacity: {
      label: "Match note opacity in menus",
      description: "Match each note's opacity.",
    },
    explorerMenu: {
      label: 'Add "Open with Pinote"',
      description: "Show this action for .md and .markdown files.",
    },
    defaultOpener: {
      label: "Default Markdown app",
      description: "Open .md and .markdown files with Pinote.",
    },
  },
  shortcuts: {
    keyboard: "Keyboard shortcuts",
    pressKeys: "Press keys...",
    items: {
      newNote: "New note",
      restoreWindow: "Restore hidden note",
      showAllHiddenWindows: "Show all hidden notes",
      toggleVisibleWindows: "Show or hide notes",
      toggleAlwaysOnTop: "Toggle always on top",
      toggleReadOnly: "Toggle read-only",
      toggleTheme: "Switch theme",
      hideWindow: "Hide note",
      closeWindow: "Close note",
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
      label: "Resize",
      description: "{{modifier}} + Wheel resizes the window around the pointer.",
    },
    wheelOpacity: {
      label: "Opacity",
      description: "{{modifier}} + Wheel adjusts window opacity.",
    },
    dragButton: {
      label: "Move",
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
    idle: "Not checked yet.",
    checking: "Checking for updates...",
    available: "Version {{version}} is available.",
    upToDate: "Up to date.",
    downloading: "Downloading update...",
    downloadingProgress: "Downloading update... {{progress}}%",
    readyToRestart: "Download complete. Restart to install the update.",
    failed: "Update failed.",
    unavailable: "Update status is unavailable.",
  },
  updateDialog: {
    title: "Update available",
    versions: "{{currentVersion}} → {{latestVersion}}",
    readyToDownload: "Ready to download.",
    downloadingProgress: "Downloading {{progress}}%",
    restartHelp: "Restart to finish installing.",
    later: "Later",
    restart: "Restart",
    downloading: "Downloading",
    download: "Download",
  },
  diagnostics: {
    saved_one: "Saved with {{count}} file.",
    saved_other: "Saved with {{count}} files.",
    dialog: {
      title: "Save report",
      zipArchive: "Zip archive",
    },
  },
  errors: {
    unknown: "Couldn't complete the action.",
    invalidShortcut: "Enter a valid shortcut.",
  },
};
