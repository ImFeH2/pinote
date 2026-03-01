# Pinote

A lightweight floating markdown scratchpad app for your desktop. Pinote stays on top of your workflow, providing a quick-access area to jot down notes, TODOs, code snippets, and ideas — without breaking your focus.

## Features

- **Markdown Workspace** — WYSIWYG editing with auto-save and multi-note windows
- **Always-on-Top Clarity** — Pin notes above other apps and identify state with border glow and a pin badge
- **Mouse-first Window Control** — Middle-click toggles pin, middle-drag moves the window, right-click opens quick actions
- **Cursor-centered Resize** — `Alt+Wheel` by default, with support for `Ctrl` / `Shift` / `Meta`
- **Shortcut & Interaction Customization** — Configure keyboard shortcuts and wheel resize modifier in Settings
- **Quick Access** — Global shortcut (`Alt+N`) and system tray action restore the most recently hidden note window
- **Session Restore** — Window state cache restores note windows (position, size, pin state, visibility) on next launch
- **Personalized Appearance** — Theme, per-note opacity, typography, page spacing, and modern scrollbar styling
- **Desktop Integration** — Note windows are created from UUID-based files under `notes/`, with launch-at-startup support
- **In-app Maintenance** — Built-in updater, version info, and repository link in About

## Keyboard Shortcuts

| Default Shortcut | Action               |
| ---------------- | -------------------- |
| `Alt+N`          | Restore hidden window |
| `Ctrl+Shift+T`   | Toggle always on top |
| `Ctrl+Shift+D`   | Toggle dark mode     |
| `Esc`            | Hide window          |

Shortcuts can be changed in the Settings window.

## Mouse Interactions

| Default Interaction | Action                                |
| ------------------- | ------------------------------------- |
| `Alt+Wheel`         | Resize window around cursor           |
| `Middle Click`      | Toggle always on top                  |
| `Middle Drag`       | Move window                           |
| `Right Click`       | Open context menu with common actions |

`Alt+Wheel` modifier can be changed to `Ctrl`, `Shift`, or `Meta` in Settings.

## Development

```bash
pnpm install          # Install dependencies
pnpm tauri dev        # Run in development mode
pnpm tauri build      # Build for production
```
