import { beforeEach, describe, expect, test } from "bun:test";
import { AppIndex } from "../src/apps.ts";
import { createBackend } from "../src/backend.ts";
import { openDatabase } from "../src/db.ts";
import type { System } from "../src/system.ts";
import type { Effect, Handlers, RootItem, Snippet } from "../src/types.ts";

class FakeApps extends AppIndex {
  override async list() {
    return [
      { name: "Safari", path: "/Applications/Safari.app" },
      { name: "Slack", path: "/Applications/Slack.app" },
      { name: "Visual Studio Code", path: "/Applications/Visual Studio Code.app" },
    ];
  }
  override async reload() {}
}

let handlers: Handlers;
let opened: { target: string; app?: string; reveal?: boolean }[];
let clipboard: string;
let notifications: { method: string; params: any }[];

const call = async <T = any>(method: string, params: unknown = {}): Promise<T> => (await handlers[method]!(params)) as T;
const search = async (term: string) => (await call<{ items: RootItem[] }>("rootSearch.search", { term })).items;

beforeEach(() => {
  opened = [];
  clipboard = "clip";
  notifications = [];
  const system: System = {
    open: async (target, options = {}) => void opened.push({ target, ...options }),
    readClipboard: async () => clipboard,
    writeClipboard: async (text) => void (clipboard = text),
  };
  handlers = createBackend({
    db: openDatabase(":memory:"),
    system,
    apps: new FakeApps(),
    notify: (method, params) => notifications.push({ method, params }),
    now: () => new Date("2026-10-30T09:05:00"),
  });
});

describe("root search", () => {
  test("ranks apps by match quality", async () => {
    expect((await search("sa"))[0]!.title).toBe("Safari");
    expect((await search("sl"))[0]!.title).toBe("Slack");
    expect((await search("vsc"))[0]!.title).toBe("Visual Studio Code");
    // Equal match kinds tie-break toward the shorter title.
    expect((await search("s")).slice(0, 2).map((i) => i.title)).toEqual(["Slack", "Safari"]);
  });

  test("usage lifts an otherwise tied match", async () => {
    for (let i = 0; i < 5; i++) await call("rootSearch.execute", { itemId: "app:/Applications/Safari.app" });
    expect((await search("s"))[0]!.title).toBe("Safari");
  });

  test("empty query shows suggestions then commands, never the full app list", async () => {
    await call("rootSearch.execute", { itemId: "app:/Applications/Safari.app" });
    const items = await search("");
    expect(items[0]).toMatchObject({ title: "Safari", section: "Suggestions" });
    expect(items.filter((i) => i.kind === "app")).toHaveLength(1);
    expect(items.some((i) => i.id === "cmd:create-snippet" && i.section === "Commands")).toBe(true);
  });

  test("calculator result comes first and copies the raw value", async () => {
    const items = await search("1200 * 2");
    expect(items[0]).toMatchObject({ kind: "calculator", title: "2,400", section: "Calculator" });
    const effect = await call<Effect>("rootSearch.execute", { itemId: "calculator", term: "1200 * 2" });
    expect(effect).toEqual({ type: "hide", hud: "Copied Answer" });
    expect(clipboard).toBe("2400");
    expect(await call("rootSearch.execute", { itemId: "calculator", actionId: "paste", term: "1200*2" })).toEqual({
      type: "paste",
      text: "2400",
    });
  });

  test("command keywords are searchable", async () => {
    expect((await search("new"))[0]!.id).toMatch(/^cmd:create-/);
  });

  test("opening an app hides the window", async () => {
    expect(await call("rootSearch.execute", { itemId: "app:/Applications/Safari.app" })).toEqual({ type: "hide" });
    expect(await call("rootSearch.execute", { itemId: "app:/Applications/Safari.app", actionId: "reveal" })).toEqual({ type: "hide" });
    expect(opened).toEqual([{ target: "/Applications/Safari.app", reveal: false }, { target: "/Applications/Safari.app", reveal: true }]);
  });
});

describe("snippets", () => {
  test("CRUD with keyword uniqueness and change notifications", async () => {
    const a = await call<Snippet>("snippets.create", { name: "Address", text: "1 Infinite Loop", keyword: ";addr" });
    expect(notifications.at(-1)).toEqual({ method: "snippets.keywordsChanged", params: { keywords: [";addr"] } });
    await expect(call("snippets.create", { name: "Other", text: "x", keyword: ";addr" })).rejects.toThrow("already used by “Address”");
    await expect(call("snippets.create", { name: "Spaces", text: "x", keyword: "a b" })).rejects.toThrow("spaces");
    await expect(call("snippets.create", { name: " ", text: "x" })).rejects.toThrow("Name is required");

    expect(await call("snippets.isKeywordAvailable", { keyword: ";addr" })).toBe(false);
    expect(await call("snippets.isKeywordAvailable", { keyword: ";addr", excludeId: a.id })).toBe(true);

    const updated = await call<Snippet>("snippets.update", { id: a.id, name: "Home", text: "{cursor}!", keyword: "" });
    expect(updated.keyword).toBeNull();
    expect(await call("snippets.keywords")).toEqual([]);

    await call("snippets.delete", { id: a.id });
    expect(await call("snippets.list")).toEqual([]);
  });

  test("expand by keyword renders placeholders", async () => {
    await call("snippets.create", { name: "Sig", text: "Hi {clipboard},{cursor} bye", keyword: ";sig" });
    expect(await call("snippets.expand", { keyword: ";sig" })).toEqual({ text: "Hi clip, bye", cursorFromEnd: 4 });
    await expect(call("snippets.expand", { keyword: ";nope" })).rejects.toThrow();
  });

  test("list filters by name, keyword and text", async () => {
    await call("snippets.create", { name: "Email", text: "me@example.com", keyword: ";em" });
    await call("snippets.create", { name: "Phone", text: "+33 6 00", keyword: ";ph" });
    expect((await call<Snippet[]>("snippets.list", { term: "phone" })).map((s) => s.name)).toEqual(["Phone"]);
    expect((await call<Snippet[]>("snippets.list", { term: "example" })).map((s) => s.name)).toEqual(["Email"]);
  });

  test("execute actions", async () => {
    const s = await call<Snippet>("snippets.create", { name: "Greeting", text: "Hello {day}" });
    expect(await call("snippets.execute", { id: s.id, actionId: "paste" })).toEqual({ type: "paste", text: "Hello Friday", cursorFromEnd: 0 });
    expect(await call("snippets.execute", { id: s.id, actionId: "copy" })).toEqual({ type: "hide", hud: "Copied Snippet" });
    expect(clipboard).toBe("Hello Friday");
    expect(await call("snippets.execute", { id: s.id, actionId: "edit" })).toEqual({ type: "push", route: { name: "snippet-form", id: s.id } });
  });
});

describe("quicklinks", () => {
  test("appear in root search with an argument slot and open with the encoded argument", async () => {
    const q = await call("quicklinks.create", { name: "Google Search", link: "https://google.com/search?q={argument}" });
    expect(notifications.at(-1)!.method).toBe("rootSearch.invalidated");
    const item = (await search("goo"))[0]!;
    expect(item).toMatchObject({ id: `quicklink:${q.id}`, argument: { placeholder: "Query" } });
    expect(await call("rootSearch.execute", { itemId: item.id, argument: "bun sqlite" })).toEqual({ type: "hide" });
    expect(opened.at(-1)).toEqual({ target: "https://google.com/search?q=bun%20sqlite", app: undefined });
  });

  test("open with a specific app", async () => {
    const q = await call("quicklinks.create", { name: "Docs", link: "https://bun.sh/docs", openWith: "Safari" });
    await call("quicklinks.execute", { id: q.id, actionId: "open" });
    expect(opened.at(-1)).toEqual({ target: "https://bun.sh/docs", app: "Safari" });
  });

  test("delete refreshes and forgets usage", async () => {
    const q = await call("quicklinks.create", { name: "Docs", link: "https://bun.sh/docs" });
    await call("quicklinks.execute", { id: q.id, actionId: "open" });
    const effect = await call<Effect>("quicklinks.execute", { id: q.id, actionId: "delete" });
    expect(effect).toMatchObject({ type: "refresh" });
    expect((await search("")).some((i) => i.id === `quicklink:${q.id}`)).toBe(false);
  });

  test("validation", async () => {
    await expect(call("quicklinks.create", { name: "x", link: " " })).rejects.toThrow("Link is required");
  });
});
