import type { Database } from "bun:sqlite";
import type { GeneralSettings, Hotkey, Modifier } from "./types.ts";

export const DEFAULT_SETTINGS: GeneralSettings = { globalHotkey: { modifiers: ["option"], key: "Space" } };

const MODIFIERS: Modifier[] = ["control", "option", "shift", "command"];

/** Settings Raycast calls "general", stored one key per row. */
export class SettingsStore {
  constructor(private db: Database) {}

  get(): GeneralSettings {
    const rows = this.db.query("SELECT key, value FROM settings").all() as { key: string; value: string }[];
    const stored = Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)]));
    return { ...DEFAULT_SETTINGS, ...stored };
  }

  update(changes: Partial<GeneralSettings>): GeneralSettings {
    if (changes.globalHotkey !== undefined) validateHotkey(changes.globalHotkey);
    const upsert = this.db.query(
      "INSERT INTO settings (key, value) VALUES ($key, $value) ON CONFLICT(key) DO UPDATE SET value = $value",
    );
    this.db.transaction(() => {
      for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof GeneralSettings)[]) {
        if (changes[key] !== undefined) upsert.run({ key, value: JSON.stringify(changes[key]) });
      }
    })();
    return this.get();
  }
}

function validateHotkey(hotkey: Hotkey) {
  if (typeof hotkey?.key !== "string" || !hotkey.key) throw new Error("Hotkey needs a key");
  if (!Array.isArray(hotkey.modifiers) || hotkey.modifiers.some((m) => !MODIFIERS.includes(m))) {
    throw new Error("Hotkey modifiers must be control, option, shift or command");
  }
  if (!hotkey.modifiers.length && !/^F\d+$/.test(hotkey.key)) throw new Error("Hotkey needs a modifier");
}
