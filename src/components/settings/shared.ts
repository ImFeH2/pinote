import {
  type DragMouseButton,
  type WheelResizeModifier,
  type WindowsGlassEffect,
} from "@/stores/settings";

export const globalShortcutKeys = [
  "newNote",
  "restoreWindow",
  "showAllHiddenWindows",
  "toggleVisibleWindows",
] as const;

export type GlobalShortcutKey = (typeof globalShortcutKeys)[number];

export const shortcutItems = [
  { key: "newNote", label: "New Note" },
  { key: "restoreWindow", label: "Restore Hidden Window" },
  { key: "showAllHiddenWindows", label: "Show All Hidden Windows" },
  { key: "toggleVisibleWindows", label: "Toggle Visible Windows" },
  { key: "toggleAlwaysOnTop", label: "Toggle Always On Top" },
  { key: "toggleReadOnly", label: "Toggle Read-Only" },
  { key: "toggleTheme", label: "Toggle Theme" },
  { key: "hideWindow", label: "Hide Window" },
  { key: "closeWindow", label: "Close Window" },
] as const;

export type ShortcutKey = (typeof shortcutItems)[number]["key"];

export const themeOptions = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const;

export const fontFamilyOptions = [
  { value: "system", label: "System" },
  { value: "serif", label: "Serif" },
  { value: "mono", label: "Monospace" },
] as const;

export const wheelResizeModifierOptions: Array<{ value: WheelResizeModifier; label: string }> = [
  { value: "alt", label: "Alt" },
  { value: "ctrl", label: "Ctrl" },
  { value: "shift", label: "Shift" },
  { value: "meta", label: "Meta" },
];

export const dragMouseButtonOptions: Array<{ value: DragMouseButton; label: string }> = [
  { value: "middle", label: "Middle" },
  { value: "right", label: "Right" },
];

export const windowsGlassEffectOptions: Array<{ value: WindowsGlassEffect; label: string }> = [
  { value: "mica", label: "Mica" },
  { value: "acrylic", label: "Acrylic" },
  { value: "blur", label: "Blur" },
  { value: "none", label: "Disabled" },
];

export const sections = [
  {
    id: "appearance",
    label: "Appearance",
    description: "Theme and visual style settings.",
  },
  {
    id: "window",
    label: "Window",
    description: "Window behavior and startup settings.",
  },
  {
    id: "shortcuts",
    label: "Shortcuts",
    description: "Keyboard shortcuts and interaction key customization.",
  },
  {
    id: "history",
    label: "History",
    description: "Search and reopen previously opened notes.",
  },
  {
    id: "about",
    label: "About",
    description: "Version, updates, and project resources.",
  },
] as const;

export type SettingsSection = (typeof sections)[number]["id"];
