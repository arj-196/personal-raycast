import type { Database } from "bun:sqlite";
import { UsageStore } from "./db.ts";
import { matchScore, usageBoost } from "./fuzzy.ts";
import { render } from "./placeholders.ts";
import { SnippetStore, type SnippetInput } from "./snippets.ts";
import type { System } from "./system.ts";
import type { Action, Effect, GlyphName, Handlers, RootItem, Snippet } from "./types.ts";

const MAX_RESULTS = 40;

type Command = { id: string; title: string; glyph: GlyphName; keywords: string[]; effect: Effect };

export type BackendOptions = {
  db: Database;
  system: System;
  notify?: (method: string, params: unknown) => void;
  now?: () => Date;
};

const CREATE_SNIPPET: Command = {
  id: "cmd:create-snippet",
  title: "Create Snippet",
  glyph: "snippet-add",
  keywords: ["new", "add", "text"],
  effect: { type: "push", route: { name: "snippet-form" } },
};

const COMMANDS: Command[] = [
  CREATE_SNIPPET,
  { id: "cmd:quit", title: "Quit Personal Raycast", glyph: "power", keywords: ["exit", "close"], effect: { type: "quit" } },
];

export function createBackend(options: BackendOptions): Handlers {
  const { db, system } = options;
  const notify = options.notify ?? (() => {});
  const now = options.now ?? (() => new Date());
  const snippets = new SnippetStore(db);
  const usage = new UsageStore(db);

  const snippetsChanged = () => {
    notify("snippets.keywordsChanged", { keywords: snippets.keywords() });
    notify("rootSearch.invalidated", {});
  };

  const expandSnippet = async (snippet: { text: string }) =>
    render(snippet.text, { now: now(), readClipboard: () => system.readClipboard() });

  /**
   * Root search lists snippets themselves, not a "Search Snippets" command: they're the only thing
   * this launcher does. Empty query: every snippet, most used first, then the commands.
   */
  function search(term: string): RootItem[] {
    const usageById = usage.all();
    const at = now().getTime();
    const boost = (item: RootItem) => usageBoost(usageById.get(item.id), at);

    if (!term.trim()) {
      const ranked = snippets
        .list()
        .map((snippet) => snippetItem(snippet, "Snippets"))
        .sort((a, b) => boost(b) - boost(a));
      return [...ranked, ...COMMANDS.map((c) => commandItem(c, "Commands"))];
    }

    const results = [
      ...snippets.search(term).map(({ snippet, score }) => ({ item: snippetItem(snippet, "Results"), score })),
      ...COMMANDS.map((c) => ({ item: commandItem(c, "Results"), score: matchScore(term, c.title, c.keywords) })),
    ]
      .filter((entry) => entry.score > 0)
      .map((entry) => ({ item: entry.item, score: entry.score + boost(entry.item) }))
      .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title))
      .slice(0, MAX_RESULTS)
      .map((entry) => entry.item);
    // Nothing matched: offer to create it rather than show an empty list.
    return results.length ? results : [commandItem(CREATE_SNIPPET, "Commands")];
  }

  async function executeSnippet(id: number, actionId: string): Promise<Effect> {
    const snippet = snippets.get(id);
    switch (actionId) {
      case "paste": {
        const { text, cursorFromEnd } = await expandSnippet(snippet);
        usage.record(`snippet:${id}`);
        return { type: "paste", text, cursorFromEnd };
      }
      case "copy": {
        const { text } = await expandSnippet(snippet);
        await system.writeClipboard(text);
        usage.record(`snippet:${id}`);
        return { type: "hide", hud: "Copied Snippet" };
      }
      case "edit":
        return { type: "push", route: { name: "snippet-form", id } };
      case "create":
        return CREATE_SNIPPET.effect;
      case "delete":
        snippets.delete(id);
        usage.forget(`snippet:${id}`);
        snippetsChanged();
        return { type: "refresh", toast: { style: "success", title: `Deleted “${snippet.name}”` } };
      default:
        throw new Error(`Unknown snippet action: ${actionId}`);
    }
  }

  async function execute(params: { itemId: string; actionId?: string }): Promise<Effect> {
    const { itemId } = params;
    const [kind, target] = itemId.split(":");
    if (kind === "snippet") return executeSnippet(Number(target), params.actionId ?? "paste");
    if (kind === "cmd") {
      const cmd = COMMANDS.find((c) => c.id === itemId);
      if (!cmd) throw new Error(`Unknown command: ${itemId}`);
      usage.record(itemId);
      return cmd.effect;
    }
    throw new Error(`Unknown item: ${itemId}`);
  }

  return {
    "system.ping": () => ({ ok: true }),
    "rootSearch.search": ({ term = "" }: { term?: string }) => ({ items: search(term) }),
    "rootSearch.execute": execute,

    "snippets.list": ({ term }: { term?: string }) => snippets.list(term),
    "snippets.get": ({ id }: { id: number }) => snippets.get(id),
    "snippets.keywords": () => snippets.keywords(),
    "snippets.isKeywordAvailable": ({ keyword, excludeId }: { keyword: string; excludeId?: number }) =>
      snippets.isKeywordAvailable(keyword, excludeId),
    "snippets.create": (input: SnippetInput) => {
      const snippet = snippets.create(input);
      snippetsChanged();
      return snippet;
    },
    "snippets.update": ({ id, ...input }: SnippetInput & { id: number }) => {
      const snippet = snippets.update(id, input);
      snippetsChanged();
      return snippet;
    },
    "snippets.delete": ({ id }: { id: number }) => {
      snippets.delete(id);
      usage.forget(`snippet:${id}`);
      snippetsChanged();
      return null;
    },
    "snippets.execute": ({ id, actionId }: { id: number; actionId: string }) => executeSnippet(id, actionId),
    /** Used by the host's keyword auto-expansion. */
    "snippets.expand": async ({ keyword }: { keyword: string }) => {
      const snippet = snippets.getByKeyword(keyword);
      if (!snippet) throw new Error(`No snippet for keyword ${keyword}`);
      return expandSnippet(snippet);
    },
  };
}

const SNIPPET_ACTIONS: Action[] = [
  { id: "paste", title: "Paste Snippet" },
  { id: "copy", title: "Copy to Clipboard", shortcut: "⌘↵" },
  { id: "edit", title: "Edit Snippet", shortcut: "⌘E" },
  { id: "create", title: "Create Snippet", shortcut: "⌘N" },
  { id: "delete", title: "Delete Snippet", shortcut: "⌃X", destructive: true },
];

function snippetItem(snippet: Snippet, section: RootItem["section"]): RootItem {
  const updated = new Date(snippet.updatedAt).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return {
    id: `snippet:${snippet.id}`,
    kind: "snippet",
    section,
    title: snippet.name,
    accessory: snippet.keyword ?? undefined,
    icon: { type: "glyph", name: "snippet" },
    detail: {
      text: snippet.text,
      metadata: [
        { label: "Keyword", value: snippet.keyword ?? "—" },
        { label: "Updated", value: updated },
      ],
    },
    actions: SNIPPET_ACTIONS,
  };
}

function commandItem(command: Command, section: RootItem["section"]): RootItem {
  return {
    id: command.id,
    kind: "command",
    section,
    title: command.title,
    accessory: "Command",
    icon: { type: "glyph", name: command.glyph },
    actions: [{ id: "run", title: "Open Command" }],
  };
}
