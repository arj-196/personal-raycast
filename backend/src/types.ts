export type Icon = { type: "glyph"; name: GlyphName };

export type GlyphName = "snippet" | "snippet-add" | "power" | "gear";

export type Action = { id: string; title: string; shortcut?: string; destructive?: boolean };

export type RootItem = {
  id: string;
  kind: "snippet" | "command";
  section: "Snippets" | "Commands" | "Results";
  title: string;
  subtitle?: string;
  accessory?: string;
  icon: Icon;
  /** Shown in the detail pane beside the list, like Raycast's List.Item.Detail. */
  detail?: { text: string; metadata: { label: string; value: string }[] };
  actions: Action[];
};

export type Route = { name: "snippet-form"; id?: number } | { name: "settings" };

export type Toast = { style: "success" | "failure"; title: string; message?: string };

export type Effect =
  | { type: "hide"; hud?: string }
  | { type: "push"; route: Route }
  | { type: "paste"; text: string; cursorFromEnd?: number }
  | { type: "refresh"; toast?: Toast }
  | { type: "quit" };

export type Snippet = {
  id: number;
  name: string;
  text: string;
  keyword: string | null;
  createdAt: number;
  updatedAt: number;
};

export type Handler = (params: any) => unknown | Promise<unknown>;
export type Handlers = Record<string, Handler>;

export type Modifier = "control" | "option" | "shift" | "command";

/** A global shortcut. `key` is a DOM `KeyboardEvent.code` ("Space", "KeyK"); the host maps it to a key code. */
export type Hotkey = { modifiers: Modifier[]; key: string };

export type GeneralSettings = { globalHotkey: Hotkey };
