import type { Database } from "bun:sqlite";
import { AppIndex } from "./apps.ts";
import { calculate } from "./calculator.ts";
import { UsageStore } from "./db.ts";
import { matchScore, usageBoost } from "./fuzzy.ts";
import { hasArgument, render } from "./placeholders.ts";
import { QuicklinkStore, resolveLink, type QuicklinkInput } from "./quicklinks.ts";
import { SnippetStore, type SnippetInput } from "./snippets.ts";
import type { System } from "./system.ts";
import type { Action, Effect, GlyphName, Handlers, Quicklink, RootItem } from "./types.ts";

const MAX_RESULTS = 40;
const MAX_SUGGESTIONS = 6;

type Command = { id: string; title: string; subtitle: string; glyph: GlyphName; keywords: string[]; run: () => Promise<Effect> };

export type BackendOptions = {
  db: Database;
  system: System;
  apps?: AppIndex;
  notify?: (method: string, params: unknown) => void;
  now?: () => Date;
};

export function createBackend(options: BackendOptions): Handlers {
  const { db, system } = options;
  const apps = options.apps ?? new AppIndex();
  const notify = options.notify ?? (() => {});
  const now = options.now ?? (() => new Date());
  const snippets = new SnippetStore(db);
  const quicklinks = new QuicklinkStore(db);
  const usage = new UsageStore(db);

  const snippetsChanged = () => notify("snippets.keywordsChanged", { keywords: snippets.keywords() });
  const quicklinksChanged = () => notify("rootSearch.invalidated", {});

  const commands: Command[] = [
    command("search-snippets", "Search Snippets", "Snippets", "snippet", ["text", "expand"], { type: "push", route: { name: "snippets-list" } }),
    command("create-snippet", "Create Snippet", "Snippets", "snippet-add", ["new", "add", "text"], { type: "push", route: { name: "snippet-form" } }),
    command("search-quicklinks", "Search Quicklinks", "Quicklinks", "link", ["url", "bookmark"], { type: "push", route: { name: "quicklinks-list" } }),
    command("create-quicklink", "Create Quicklink", "Quicklinks", "link-add", ["new", "add", "url", "bookmark"], { type: "push", route: { name: "quicklink-form" } }),
    {
      id: "cmd:reload-apps",
      title: "Reload Applications",
      subtitle: "Personal Raycast",
      glyph: "refresh",
      keywords: ["rescan", "refresh"],
      run: async () => {
        await apps.reload();
        return { type: "toast", style: "success", title: `Found ${(await apps.list()).length} applications` };
      },
    },
    command("quit", "Quit Personal Raycast", "Personal Raycast", "power", ["exit", "close"], { type: "quit" }),
  ];

  const expandSnippet = async (snippet: { text: string }) =>
    render(snippet.text, { now: now(), readClipboard: () => system.readClipboard() });

  const quicklinkItem = (q: Quicklink): RootItem => ({
    id: `quicklink:${q.id}`,
    kind: "quicklink",
    section: "Results",
    title: q.name,
    subtitle: q.link,
    accessory: "Quicklink",
    icon: { type: "glyph", name: "link" },
    argument: hasArgument(q.link) ? { placeholder: "Query" } : undefined,
    actions: QUICKLINK_ACTIONS,
  });

  async function candidates(): Promise<RootItem[]> {
    const appItems: RootItem[] = (await apps.list()).map((app) => ({
      id: `app:${app.path}`,
      kind: "app",
      section: "Results",
      title: app.name,
      accessory: "Application",
      icon: { type: "app", path: app.path },
      actions: APP_ACTIONS,
    }));
    const commandItems: RootItem[] = commands.map((c) => ({
      id: c.id,
      kind: "command",
      section: "Commands",
      title: c.title,
      subtitle: c.subtitle,
      accessory: "Command",
      icon: { type: "glyph", name: c.glyph },
      actions: [{ id: "run", title: "Open Command" }],
    }));
    return [...appItems, ...commandItems, ...quicklinks.list().map(quicklinkItem)];
  }

  async function search(term: string): Promise<RootItem[]> {
    const items = await candidates();
    const usageById = usage.all();
    const at = now().getTime();

    if (!term.trim()) {
      const suggestions = items
        .filter((item) => usageById.has(item.id))
        .sort((a, b) => usageBoost(usageById.get(b.id), at) - usageBoost(usageById.get(a.id), at))
        .slice(0, MAX_SUGGESTIONS)
        .map((item) => ({ ...item, section: "Suggestions" as const }));
      const suggested = new Set(suggestions.map((item) => item.id));
      const rest = items
        .filter((item) => item.kind !== "app" && !suggested.has(item.id))
        .map((item) => ({ ...item, section: "Commands" as const }));
      return [...suggestions, ...rest];
    }

    const keywordsFor = (item: RootItem) => commands.find((c) => c.id === item.id)?.keywords ?? [];
    const results = items
      .map((item) => {
        const score = matchScore(term, item.title, keywordsFor(item));
        return { item, score: score > 0 ? score + usageBoost(usageById.get(item.id), at) : 0 };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title))
      .slice(0, MAX_RESULTS)
      .map(({ item }) => ({ ...item, section: "Results" as const }));

    const calculation = calculate(term);
    if (!calculation) return results;
    const calcItem: RootItem = {
      id: "calculator",
      kind: "calculator",
      section: "Calculator",
      title: calculation.result,
      subtitle: calculation.expression,
      icon: { type: "glyph", name: "calculator" },
      actions: [
        { id: "copy", title: "Copy Answer" },
        { id: "paste", title: "Paste Answer", shortcut: "⌘↵" },
      ],
    };
    return [calcItem, ...results];
  }

  async function executeQuicklink(id: number, actionId: string, argument?: string): Promise<Effect> {
    const quicklink = quicklinks.get(id);
    switch (actionId) {
      case "open": {
        const url = await resolveLink(quicklink.link, { argument, now: now(), readClipboard: () => system.readClipboard() });
        await system.open(url, { app: quicklink.openWith ?? undefined });
        usage.record(`quicklink:${id}`);
        return { type: "hide" };
      }
      case "edit":
        return { type: "push", route: { name: "quicklink-form", id } };
      case "copy-link":
        await system.writeClipboard(quicklink.link);
        return { type: "hide", hud: "Copied Link" };
      case "delete":
        quicklinks.delete(id);
        usage.forget(`quicklink:${id}`);
        quicklinksChanged();
        return { type: "refresh", toast: { style: "success", title: `Deleted “${quicklink.name}”` } };
      default:
        throw new Error(`Unknown quicklink action: ${actionId}`);
    }
  }

  async function executeSnippet(id: number, actionId: string): Promise<Effect> {
    const snippet = snippets.get(id);
    switch (actionId) {
      case "paste": {
        const { text, cursorFromEnd } = await expandSnippet(snippet);
        return { type: "paste", text, cursorFromEnd };
      }
      case "copy": {
        const { text } = await expandSnippet(snippet);
        await system.writeClipboard(text);
        return { type: "hide", hud: "Copied Snippet" };
      }
      case "edit":
        return { type: "push", route: { name: "snippet-form", id } };
      case "delete":
        snippets.delete(id);
        snippetsChanged();
        return { type: "refresh", toast: { style: "success", title: `Deleted “${snippet.name}”` } };
      default:
        throw new Error(`Unknown snippet action: ${actionId}`);
    }
  }

  async function execute(params: { itemId: string; actionId?: string; argument?: string; term?: string }): Promise<Effect> {
    const { itemId, argument, term = "" } = params;
    const [kind, ...rest] = itemId.split(":");
    const target = rest.join(":");
    const record = () => usage.record(itemId);

    if (kind === "app") {
      const actionId = params.actionId ?? "open";
      if (actionId === "copy-path") {
        await system.writeClipboard(target);
        return { type: "hide", hud: "Copied Path" };
      }
      await system.open(target, { reveal: actionId === "reveal" });
      record();
      return { type: "hide" };
    }
    if (kind === "cmd") {
      const cmd = commands.find((c) => c.id === itemId);
      if (!cmd) throw new Error(`Unknown command: ${itemId}`);
      record();
      return cmd.run();
    }
    if (kind === "quicklink") return executeQuicklink(Number(target), params.actionId ?? "open", argument);
    if (kind === "calculator") {
      const calculation = calculate(term);
      if (!calculation) throw new Error("Nothing to calculate");
      if (params.actionId === "paste") return { type: "paste", text: calculation.raw };
      await system.writeClipboard(calculation.raw);
      return { type: "hide", hud: "Copied Answer" };
    }
    throw new Error(`Unknown item: ${itemId}`);
  }

  return {
    "system.ping": () => ({ ok: true }),
    "rootSearch.search": async ({ term = "" }: { term?: string }) => ({ items: await search(term) }),
    "rootSearch.execute": execute,
    "calculator.calculate": ({ expression }: { expression: string }) => calculate(expression),
    "apps.list": () => apps.list(),
    "apps.reload": async () => {
      await apps.reload();
      return { count: (await apps.list()).length };
    },

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

    "quicklinks.list": ({ term }: { term?: string }) => quicklinks.list(term).map((q) => ({ ...q, hasArgument: hasArgument(q.link) })),
    "quicklinks.get": ({ id }: { id: number }) => quicklinks.get(id),
    "quicklinks.create": (input: QuicklinkInput) => {
      const quicklink = quicklinks.create(input);
      quicklinksChanged();
      return quicklink;
    },
    "quicklinks.update": ({ id, ...input }: QuicklinkInput & { id: number }) => {
      const quicklink = quicklinks.update(id, input);
      quicklinksChanged();
      return quicklink;
    },
    "quicklinks.execute": ({ id, actionId, argument }: { id: number; actionId: string; argument?: string }) =>
      executeQuicklink(id, actionId, argument),
  };
}

const APP_ACTIONS: Action[] = [
  { id: "open", title: "Open Application" },
  { id: "reveal", title: "Show in Finder", shortcut: "⌘↵" },
  { id: "copy-path", title: "Copy Path", shortcut: "⌘⇧C" },
];

const QUICKLINK_ACTIONS: Action[] = [
  { id: "open", title: "Open Quicklink" },
  { id: "edit", title: "Edit Quicklink", shortcut: "⌘E" },
  { id: "copy-link", title: "Copy Link", shortcut: "⌘⇧C" },
  { id: "delete", title: "Delete Quicklink", shortcut: "⌃X", destructive: true },
];

function command(id: string, title: string, subtitle: string, glyph: GlyphName, keywords: string[], effect: Effect): Command {
  return { id: `cmd:${id}`, title, subtitle, glyph, keywords, run: async () => effect };
}
