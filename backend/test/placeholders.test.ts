import { expect, test } from "bun:test";
import { render } from "../src/placeholders.ts";

const now = new Date("2026-10-30T09:05:00");
const ctx = { now, readClipboard: async () => "from clipboard" };

test("substitutes dynamic placeholders", async () => {
  const { text } = await render("{day} {date} {time} — {clipboard}", ctx);
  expect(text).toBe("Friday 30 Oct 2026 09:05 — from clipboard");
});

test("does not read the clipboard unless asked", async () => {
  let reads = 0;
  await render("hello", { now, readClipboard: async () => (reads++, "") });
  expect(reads).toBe(0);
});

test("{cursor} reports position from end in graphemes", async () => {
  expect(await render("<b>{cursor}</b>", ctx)).toEqual({ text: "<b></b>", cursorFromEnd: 4 });
  expect(await render("{cursor}👍🏽!", ctx)).toEqual({ text: "👍🏽!", cursorFromEnd: 2 });
  expect(await render("no cursor", ctx)).toEqual({ text: "no cursor", cursorFromEnd: 0 });
});

test("only the first {cursor} is honoured", async () => {
  expect(await render("a{cursor}b{cursor}c", ctx)).toEqual({ text: "abc", cursorFromEnd: 2 });
});

test("uuid is a v4 uuid", async () => {
  expect((await render("{uuid}", ctx)).text).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
