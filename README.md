# Pinote

A lightweight floating markdown scratchpad app for your desktop. Pinote stays on top of your workflow, providing a quick-access area to jot down notes, TODOs, code snippets, and ideas — without breaking your focus.

![Pinote Screenshot](./preview/pinote-screenshot.png)

## Features

- **Markdown Workspace** — WYSIWYG editing with per-file auto-save and multi-note windows
- **External File Sync** — Detects external file changes in real time and auto-reloads when safe
- **Single Window per File** — Opening the same path focuses the existing window instead of creating duplicate editors
- **Window Workflow Shortcuts** — Restore latest hidden window, show all hidden windows, and toggle the current visible window set
- **Shortcut & Mouse Customization** — Configure keyboard shortcuts, wheel modifiers, and drag button (`Middle` / `Right`) in Settings
- **Session Restore** — Restores window position, size, visibility, always-on-top, opacity, and editor scroll position
- **Searchable Open History** — Find and reopen previously opened notes by path or content
- **Appearance & Platform Controls** — Theme, per-note opacity, typography, spacing, taskbar visibility, and optional glass effects
- **Desktop Integration** — System tray controls, launch-at-startup option, and CLI open for `.md` / `.markdown`

## Keyboard Shortcuts

| Default Shortcut | Action                 |
| ---------------- | ---------------------- |
| `Alt+S`          | Restore hidden window  |
| `Alt+Shift+H`    | Show all hidden windows |
| `Alt+D`          | Toggle visible windows |
| `Alt+A`          | Toggle always on top   |
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

## Development

```bash
pnpm install          # Install dependencies
pnpm tauri dev        # Run in development mode
pnpm tauri build      # Build for production
```

## CLI

```bash
pinote /path/to/note.md
pinote ./daily.markdown
```

Each path opens a dedicated note window. Running the command again with the same path focuses the existing window.
