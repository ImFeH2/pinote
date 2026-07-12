# Pinote

[![Tauri](https://img.shields.io/badge/Tauri-2-24c8db?logo=tauri&logoColor=white)](https://github.com/tauri-apps/tauri)
[![Release](https://img.shields.io/github/v/release/ImFeH2/pinote?display_name=tag&sort=semver)](https://github.com/ImFeH2/pinote/releases/latest)
[![CI](https://github.com/ImFeH2/pinote/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/ImFeH2/pinote/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/ImFeH2/pinote)](./LICENSE)
[![Platforms](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-24292f)](#installation)

A lightweight floating markdown scratchpad app for your desktop. Pinote stays on top of your workflow, providing a quick-access area to jot down notes, TODOs, code snippets, and ideas — without breaking your focus.

![Pinote Screenshot](./preview/pinote-screenshot.png)

## Installation

Download the latest release from [GitHub Releases](https://github.com/ImFeH2/pinote/releases/latest).

| Platform | Recommended Package |
| -------- | ------------------- |
| Windows  | winget or `.msi` installer |
| macOS    | `.dmg` installer for Apple Silicon or Intel |
| Linux    | `.AppImage`, `.deb`, or `.rpm` |

For Windows:

```powershell
winget install ImFeH2.Pinote
```

Pinote checks for app updates when it starts.

## Features

- **Markdown Notes** — Edit Markdown in lightweight WYSIWYG windows, with multiple notes open at once.
- **File Sync** — Detects external file changes and reloads them when it is safe.
- **Window States** — Toggle always-on-top, read-only, opacity, and visibility per note.
- **Window Shortcuts** — Restore hidden notes, show all hidden notes, or toggle the current visible set.
- **Custom Controls** — Change keyboard shortcuts, wheel modifiers, and the drag button in Settings.
- **Session Restore** — Restores position, size, visibility, pin state, opacity, scroll, read-only state, and the last visible set.
- **History Search** — Find and reopen previous notes by path or content.
- **Appearance** — Adjust theme, typography, spacing, opacity, taskbar visibility, and glass effects.
- **Desktop Tools** — Use tray controls, launch at startup, and open `.md` / `.markdown` files from the command line.
- **Updates** — Pinote checks for app updates when it starts.

## Keyboard Shortcuts

| Default Shortcut | Action                 |
| ---------------- | ---------------------- |
| `Alt+S`          | Restore hidden window  |
| `Alt+Shift+H`    | Show all hidden windows |
| `Alt+D`          | Toggle visible windows |
| `Alt+C`          | New note               |
| `Alt+A`          | Toggle always on top   |
| `Alt+R`          | Toggle read-only mode  |
| `Ctrl+Shift+D`   | Toggle dark mode       |
| `Esc`            | Hide window            |
| `Ctrl+Shift+W`   | Close window           |

Shortcuts can be changed in the Settings window.

## Mouse Interactions

| Default Interaction | Action                                |
| ------------------- | ------------------------------------- |
| `Alt+Wheel`         | Resize window around cursor           |
| `Middle Click`      | Toggle always on top                  |
| `Middle Drag`       | Move window (default, configurable)   |
| `Right Click`       | Open context menu with common actions |

`Alt+Wheel` modifier can be changed to `Ctrl`, `Shift`, or `Meta` in Settings. Drag button can be changed to `Middle` or `Right`.

## CLI

```bash
pinote /path/to/note.md
pinote ./daily.markdown
```

Each path opens a dedicated note window. Running the command again with the same path focuses the existing window.

## Development

```bash
pnpm install          # Install dependencies
pnpm tauri dev        # Run in development mode
pnpm tauri build      # Build for production
```
