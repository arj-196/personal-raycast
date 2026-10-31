import { beforeEach, describe, expect, test } from "bun:test";
import { createBackend } from "../src/backend.ts";
import { openDatabase } from "../src/db.ts";
import type { System } from "../src/system.ts";
import type { Effect, Handlers, RootItem, Snippet } from "../src/types.ts";

let handlers: Handlers;
let clipboard: string;
let notifications: { method: string; params: any }[];

const call = async <T = any>(method: string, params: unknown = {}): Promise<T> => (await handlers[method]!(params)) as T;
const search = async (term: string) => (await call<{ items: RootItem[] }>("rootSearch.search", { term })).items;
const titles = (items: RootItem[]) => items.map((i) => i.title);

beforeEach(() => {
  clipboard = "clip";
  notifications = [];
  const system: System = {
    readClipboard: async () => clipboard,
    writeClipboard: async (text) => void (clipboard = text),
  };
  handlers = createBackend({
    db: openDatabase(":memory:"),
    system,
    notify: (method, params) => notifications.push({ method, params }),
    now: () => new Date("2026-10-30T09:05:00"),
  });
});

describe("root search", () => {
  const seed = async () => {
    await call("snippets.create", { name: "Email signature", text: "Best,\nArjun", keyword: ";sig" });
    await call("snippets.create", { name: "Address", text: "1 Infinite Loop, Cupertino", keyword: ";addr" });
    await call("snippets.create", { name: "Meeting link", text: "https://meet.example.com/arjun" });
  };

  test("empty query lists every snippet by name, then the commands", async () => {
    await seed();
    const items = await search("");
    expect(titles(items)).toEqual(["Address", "Email signature", "Meeting link", "Create Snippet", "Quit Personal Raycast"]);
    expect(items[0]).toMatchObject({ kind: "snippet", section: "Snippets", accessory: ";addr" });
    expect(items.at(-1)).toMatchObject({ kind: "command", section: "Commands" });
  });

  test("used snippets move to the top of the empty query", async () => {
    await seed();
    const meeting = (await search("meeting"))[0]!;
    await call("rootSearch.execute", { itemId: meeting.id });
    expect((await search(""))[0]!.title).toBe("Meeting link");
  });

  test("matches snippet name, keyword and text, never apps", async () => {
    await seed();
    expect((await search("sig"))[0]!.title).toBe("Email signature");
    expect((await search(";addr"))[0]!.title).toBe("Address");
    expect(titles(await search("cupertino"))).toEqual(["Address"]);
    expect((await search("safari")).every((i) => i.kind !== "snippet")).toBe(true);
  });

  test("text matches need a substring, not a scattered subsequence", async () => {
    await seed();
    // "bat" is a subsequence of "Best,\nArjun" but not a substring.
    expect(titles(await search("bat"))).not.toContain("Email signature");
  });

  test("snippet items carry their text for the detail pane", async () => {
    await seed();
    const item = (await search("sig"))[0]!;
    expect(item.detail).toEqual({
      text: "Best,\nArjun",
      metadata: [
        { label: "Keyword", value: ";sig" },
        { label: "Updated", value: expect.any(String) },
      ],
    });
  });

  test("command keywords are searchable", async () => {
    expect((await search("new"))[0]!.id).toBe("cmd:create-snippet");
  });

  test("no match offers Create Snippet", async () => {
    await seed();
    expect(await search("zzzz")).toMatchObject([{ id: "cmd:create-snippet", section: "Commands" }]);
  });

  test("Enter pastes the expanded snippet; other actions copy, edit, create and delete", async () => {
    const s = await call<Snippet>("snippets.create", { name: "Greeting", text: "Hello {day}{cursor}!" });
    const itemId = `snippet:${s.id}`;
    expect(await call("rootSearch.execute", { itemId })).toEqual({ type: "paste", text: "Hello Friday!", cursorFromEnd: 1 });
    expect(await call("rootSearch.execute", { itemId, actionId: "copy" })).toEqual({ type: "hide", hud: "Copied Snippet" });
    expect(clipboard).toBe("Hello Friday!");
    expect(await call("rootSearch.execute", { itemId, actionId: "create" })).toEqual({ type: "push", route: { name: "snippet-form" } });

    const effect = await call<Effect>("rootSearch.execute", { itemId, actionId: "delete" });
    expect(effect).toMatchObject({ type: "refresh", toast: { title: "Deleted “Greeting”" } });
    expect((await search("")).some((i) => i.id === itemId)).toBe(false);
  });

  test("snippet changes invalidate root search", async () => {
    await call("snippets.create", { name: "Sig", text: "x" });
    expect(notifications.map((n) => n.method)).toContain("rootSearch.invalidated");
  });
});

describe("snippets", () => {
  test("CRUD with keyword uniqueness and change notifications", async () => {
    const a = await call<Snippet>("snippets.create", { name: "Address", text: "1 Infinite Loop", keyword: ";addr" });
    expect(notifications).toContainEqual({ method: "snippets.keywordsChanged", params: { keywords: [";addr"] } });
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
