export type Icon = { type: "app"; path: string } | { type: "glyph"; name: GlyphName };

export type GlyphName =
  | "calculator"
  | "snippet"
  | "snippet-add"
  | "link"
  | "link-add"
  | "refresh"
  | "power"
  | "folder";

export type Action = { id: string; title: string; shortcut?: string; destructive?: boolean };

export type RootItem = {
  id: string;
  kind: "app" | "command" | "quicklink" | "calculator";
  section: "Calculator" | "Suggestions" | "Commands" | "Results";
  title: string;
  subtitle?: string;
  accessory?: string;
  icon: Icon;
  /** Present when the item accepts an inline argument (quicklinks with {argument}). */
  argument?: { placeholder: string };
  actions: Action[];
};

export type Route =
  | { name: "snippets-list" }
  | { name: "snippet-form"; id?: number }
  | { name: "quicklinks-list" }
  | { name: "quicklink-form"; id?: number };

export type Toast = { style: "success" | "failure"; title: string; message?: string };

export type Effect =
  | { type: "hide"; hud?: string }
  | { type: "push"; route: Route }
  | { type: "paste"; text: string; cursorFromEnd?: number }
  | ({ type: "toast" } & Toast)
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

export type Quicklink = {
  id: number;
  name: string;
  link: string;
  openWith: string | null;
  createdAt: number;
  updatedAt: number;
};

export type App = { name: string; path: string };

export type Handler = (params: any) => unknown | Promise<unknown>;
export type Handlers = Record<string, Handler>;
