# Pinote

A lightweight floating markdown scratchpad app for your desktop. Pinote stays on top of your workflow, providing a quick-access area to jot down notes, TODOs, code snippets, and ideas — without breaking your focus.

## Features

- **WYSIWYG Markdown** — Powered by Milkdown, type markdown and see it rendered instantly
- **Always on Top** — Pin the window above other apps when you need it visible
- **Pinned State Indicator** — Border glow and a pin badge make always-on-top status obvious
- **Global Shortcut** — Press `Alt+N` to show/hide from anywhere
- **Shortcut Customization** — Configure keyboard shortcuts and wheel resize modifier in settings
- **Auto Save** — Content is saved automatically, no manual saving needed
- **Multi-Note Windows** — Open multiple note windows at once and edit different markdown files in parallel
- **System Tray** — Runs quietly in the background, always one click away
- **Dark / Light Theme** — Switch with `Ctrl+Shift+D` or follow your system preference
- **Typography Controls** — Tune editor font family, size, and line height from settings
- **Page Margin Controls** — Adjust horizontal and vertical editor spacing from settings
- **Mouse Gestures & Context Menu** — Middle-click toggles always on top, right-click opens common actions, `Alt+Wheel` (default) resizes window
- **Titleless Note Window** — Note windows run without a title bar for a cleaner writing surface
- **Modern Scrollbars** — Polished slim scrollbars across editor and settings scroll areas
- **Minimal UI** — No menus, no clutter, just your notes
- **Settings Window** — Adjust theme, window behavior, opacity, and shortcuts
- **Launch at Startup** — Enable or disable app launch at system login
- **In-App Updates** — Silent startup checks plus manual check/download/install in About
- **About Panel** — View current version and open the GitHub homepage

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
