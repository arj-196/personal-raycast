const KEY_NAMES: Record<string, string> = { "↵": "enter", "⌫": "backspace", "⎋": "escape" };

type Parsed = { meta: boolean; shift: boolean; ctrl: boolean; alt: boolean; key: string };

/** Parses display shortcuts like "⌘⇧C", "⌃X", "⌘↵". */
export function parseShortcut(shortcut: string): Parsed {
  const parsed: Parsed = { meta: false, shift: false, ctrl: false, alt: false, key: "" };
  for (const char of shortcut) {
    if (char === "⌘") parsed.meta = true;
    else if (char === "⇧") parsed.shift = true;
    else if (char === "⌃") parsed.ctrl = true;
    else if (char === "⌥") parsed.alt = true;
    else parsed.key = KEY_NAMES[char] ?? char.toLowerCase();
  }
  return parsed;
}

export function matchesShortcut(event: KeyboardEvent | React.KeyboardEvent, shortcut: string): boolean {
  const s = parseShortcut(shortcut);
  return (
    event.metaKey === s.meta &&
    event.shiftKey === s.shift &&
    event.ctrlKey === s.ctrl &&
    event.altKey === s.alt &&
    event.key.toLowerCase() === s.key
  );
}

/** Splits "⌘⇧C" into keycaps for display. */
export function keycaps(shortcut: string): string[] {
  return [...shortcut];
}
