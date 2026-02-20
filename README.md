# Pinote

A lightweight floating markdown scratchpad app for your desktop. Pinote stays on top of your workflow, providing a quick-access area to jot down notes, TODOs, code snippets, and ideas — without breaking your focus.

## Features

- **WYSIWYG Markdown** — Powered by Milkdown, type markdown and see it rendered instantly
- **Always on Top** — Pin the window above other apps when you need it visible
- **Global Shortcut** — Press `Alt+N` to show/hide from anywhere
- **Shortcut Customization** — Configure global and local shortcuts in settings
- **Auto Save** — Content is saved automatically, no manual saving needed
- **System Tray** — Runs quietly in the background, always one click away
- **Dark / Light Theme** — Switch with `Ctrl+Shift+D` or follow your system preference
- **Minimal UI** — No menus, no clutter, just your notes
- **Settings Window** — Adjust theme, window behavior, opacity, and shortcuts
- **Launch at Startup** — Enable or disable app launch at system login

## Keyboard Shortcuts

| Default Shortcut | Action               |
| ---------------- | -------------------- |
| `Alt+N`          | Show / Hide window   |
| `Ctrl+Shift+T`   | Toggle always on top |
| `Ctrl+Shift+D`   | Toggle dark mode     |
| `Esc`            | Hide window          |

Shortcuts can be changed in the Settings window.

## Development

```bash
pnpm install          # Install dependencies
pnpm tauri dev        # Run in development mode
pnpm tauri build      # Build for production
```
