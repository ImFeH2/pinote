const modifierMap: Record<string, "Ctrl" | "Alt" | "Shift" | "Meta"> = {
  control: "Ctrl",
  ctrl: "Ctrl",
  option: "Alt",
  alt: "Alt",
  shift: "Shift",
  cmd: "Meta",
  command: "Meta",
  meta: "Meta",
  super: "Meta",
  win: "Meta",
};

const keyMap: Record<string, string> = {
  esc: "Escape",
  escape: "Escape",
  enter: "Enter",
  return: "Enter",
  tab: "Tab",
  space: "Space",
  spacebar: "Space",
  backspace: "Backspace",
  delete: "Delete",
  insert: "Insert",
  home: "Home",
  end: "End",
  pageup: "PageUp",
  pagedown: "PageDown",
  arrowup: "ArrowUp",
  arrowdown: "ArrowDown",
  arrowleft: "ArrowLeft",
  arrowright: "ArrowRight",
};

const modifierOrder: Array<"Ctrl" | "Alt" | "Shift" | "Meta"> = ["Ctrl", "Alt", "Shift", "Meta"];

export interface ShortcutLikeEvent {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

function normalizeToken(token: string): string | null {
  const lowered = token.trim().toLowerCase();
  if (!lowered) return null;
  if (modifierMap[lowered]) return modifierMap[lowered];
  if (keyMap[lowered]) return keyMap[lowered];
  if (lowered.length === 1) return lowered.toUpperCase();
  if (lowered.startsWith("f")) {
    const value = Number(lowered.slice(1));
    if (Number.isInteger(value) && value >= 1 && value <= 24) {
      return `F${value}`;
    }
  }
  return token.length === 1 ? token.toUpperCase() : token;
}

function isModifier(value: string) {
  return value === "Ctrl" || value === "Alt" || value === "Shift" || value === "Meta";
}

export function normalizeShortcut(shortcut: string): string | null {
  const tokens = shortcut
    .split("+")
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length === 0) return null;

  const modifiers = new Set<"Ctrl" | "Alt" | "Shift" | "Meta">();
  let key: string | null = null;

  for (const token of tokens) {
    const normalized = normalizeToken(token);
    if (!normalized) return null;
    if (isModifier(normalized)) {
      modifiers.add(normalized);
      continue;
    }
    if (key) return null;
    key = normalized;
  }

  if (!key) return null;

  const orderedModifiers = modifierOrder.filter((modifier) => modifiers.has(modifier));
  return [...orderedModifiers, key].join("+");
}

export function eventToShortcut(event: ShortcutLikeEvent): string | null {
  const key = normalizeToken(event.key);
  if (!key || isModifier(key)) return null;
  const modifiers: string[] = [];
  if (event.ctrlKey) modifiers.push("Ctrl");
  if (event.altKey) modifiers.push("Alt");
  if (event.shiftKey) modifiers.push("Shift");
  if (event.metaKey) modifiers.push("Meta");
  return normalizeShortcut([...modifiers, key].join("+"));
}

export function shortcutMatchesEvent(shortcut: string, event: ShortcutLikeEvent) {
  const expected = normalizeShortcut(shortcut);
  const incoming = eventToShortcut(event);
  if (!expected || !incoming) return false;
  return expected === incoming;
}
