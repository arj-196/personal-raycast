/** Dynamic placeholders in snippets: {clipboard} {date} {time} {datetime} {day} {uuid} {cursor}. */

export type PlaceholderContext = {
  now: Date;
  readClipboard: () => Promise<string>;
};

export type Rendered = { text: string; cursorFromEnd: number };

const PATTERN = /\{(clipboard|date|time|datetime|day|uuid|cursor)\}/g;
const CURSOR = "\u0000cursor\u0000";

export async function render(template: string, ctx: PlaceholderContext): Promise<Rendered> {
  const clipboard = template.includes("{clipboard}") ? await ctx.readClipboard() : "";
  let cursorUsed = false;

  const text = template.replace(PATTERN, (_, name: string) => {
    switch (name) {
      case "clipboard":
        return clipboard;
      case "date":
        return ctx.now.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
      case "time":
        return ctx.now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
      case "datetime":
        return `${ctx.now.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} ${ctx.now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
      case "day":
        return ctx.now.toLocaleDateString("en-GB", { weekday: "long" });
      case "uuid":
        return crypto.randomUUID();
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
