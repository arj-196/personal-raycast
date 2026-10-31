/**
 * Dynamic placeholders shared by snippets and quicklinks:
 * {clipboard} {date} {time} {datetime} {day} {uuid} {cursor} {argument} (alias {query}).
 */

export type PlaceholderContext = {
  now: Date;
  readClipboard: () => Promise<string>;
  argument?: string;
  /** Applied to substituted values only (e.g. encodeURIComponent for URLs). */
  encode?: (value: string) => string;
};

export type Rendered = { text: string; cursorFromEnd: number };

const PATTERN = /\{(clipboard|date|time|datetime|day|uuid|cursor|argument|query)\}/g;
const CURSOR = "\u0000cursor\u0000";

export function hasArgument(template: string): boolean {
  return /\{(argument|query)\}/.test(template);
}

export async function render(template: string, ctx: PlaceholderContext): Promise<Rendered> {
  const encode = ctx.encode ?? ((value: string) => value);
  const clipboard = template.includes("{clipboard}") ? await ctx.readClipboard() : "";
  let cursorUsed = false;

  const text = template.replace(PATTERN, (_, name: string) => {
    switch (name) {
      case "clipboard":
        return encode(clipboard);
      case "date":
        return encode(ctx.now.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }));
      case "time":
        return encode(ctx.now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
      case "datetime":
        return encode(
          `${ctx.now.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} ${ctx.now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`,
        );
      case "day":
        return encode(ctx.now.toLocaleDateString("en-GB", { weekday: "long" }));
      case "uuid":
        return encode(crypto.randomUUID());
      case "argument":
      case "query":
        return encode(ctx.argument ?? "");
      case "cursor":
        if (cursorUsed) return "";
        cursorUsed = true;
        return CURSOR;
      default:
        return "";
    }
  });

  const cursorIndex = text.indexOf(CURSOR);
  if (cursorIndex < 0) return { text, cursorFromEnd: 0 };
  const before = text.slice(0, cursorIndex);
  const after = text.slice(cursorIndex + CURSOR.length);
  return { text: before + after, cursorFromEnd: graphemeCount(after) };
}

function graphemeCount(text: string): number {
  return [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)].length;
}
