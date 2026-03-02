# Pinote

A lightweight floating markdown scratchpad app for your desktop. Pinote stays on top of your workflow, providing a quick-access area to jot down notes, TODOs, code snippets, and ideas — without breaking your focus.

## Features

- **Markdown Workspace** — WYSIWYG editing with auto-save and multi-note windows
- **Always-on-Top Clarity** — Pin notes above other apps and identify state with border glow and a pin badge
- **Mouse-first Window Control** — Middle-click toggles pin, drag-to-move button is configurable (`Middle`/`Right`), and right-click opens quick actions
- **Cursor-centered Resize** — `Alt+Wheel` by default, with support for `Ctrl` / `Shift` / `Meta`
- **Shortcut & Interaction Customization** — Configure keyboard shortcuts, wheel modifiers, and drag mouse button in Settings
- **Quick Access** — Global shortcut (`Alt+N`) and system tray action restore the most recently hidden note window
- **Session Restore** — Window state cache restores note windows (position, size, pin state, visibility) on next launch
- **Scroll Position Restore** — Each note remembers editor scroll position across hide/show and restart
- **Searchable Open History** — Find and reopen previously opened notes by path or content
- **Taskbar Visibility Control** — Hide or show note windows in the system taskbar from Settings (enabled by default)
- **CLI Markdown Open** — Launch Pinote with `.md`/`.markdown` file paths to open or focus dedicated note windows
- **Personalized Appearance** — Theme, per-note opacity, typography, page spacing, and modern scrollbar styling
- **Platform Glass Effects** — Windows uses selectable glass mode (`Mica` default), macOS uses a simple glass toggle, and unsupported platforms hide this option
- **Desktop Integration** — Note windows are created from UUID-based files in a configurable notes directory, with launch-at-startup support
- **In-app Maintenance** — Built-in updater, version info, and repository link in About

## Keyboard Shortcuts

| Default Shortcut | Action                  |
| ---------------- | ----------------------- |
| `Alt+N`          | Restore hidden window   |
| `Alt+Shift+N`    | Toggle visible windows  |
| `Ctrl+Shift+T`   | Toggle always on top    |
| `Ctrl+Shift+D`   | Toggle dark mode        |
| `Esc`            | Hide window             |

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
