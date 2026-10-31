import type { Database } from "bun:sqlite";
import { homedir } from "node:os";
import { matchScore } from "./fuzzy.ts";
import { render } from "./placeholders.ts";
import type { Quicklink } from "./types.ts";

type Row = { id: number; name: string; link: string; open_with: string | null; created_at: number; updated_at: number };
export type QuicklinkInput = { name: string; link: string; openWith?: string | null };

const toQuicklink = (row: Row): Quicklink => ({
  id: row.id,
  name: row.name,
  link: row.link,
  openWith: row.open_with,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class QuicklinkStore {
  constructor(private db: Database) {}

  list(term = ""): Quicklink[] {
    const all = (this.db.query("SELECT * FROM quicklinks ORDER BY name COLLATE NOCASE").all() as Row[]).map(toQuicklink);
    if (!term.trim()) return all;
    return all
      .map((quicklink) => ({ quicklink, score: matchScore(term, quicklink.name, [quicklink.link]) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.quicklink);
  }

  get(id: number): Quicklink {
    const row = this.db.query("SELECT * FROM quicklinks WHERE id = $id").get({ id }) as Row | null;
    if (!row) throw new Error(`Quicklink ${id} not found`);
    return toQuicklink(row);
  }

  create(input: QuicklinkInput, now = Date.now()): Quicklink {
    const row = this.db
      .query(
        `INSERT INTO quicklinks (name, link, open_with, created_at, updated_at)
         VALUES ($name, $link, $openWith, $now, $now) RETURNING *`,
      )
      .get({ ...validate(input), now }) as Row;
    return toQuicklink(row);
  }

  update(id: number, input: QuicklinkInput, now = Date.now()): Quicklink {
    const row = this.db
      .query(
        `UPDATE quicklinks SET name = $name, link = $link, open_with = $openWith, updated_at = $now
         WHERE id = $id RETURNING *`,
      )
      .get({ ...validate(input), now, id }) as Row | null;
    if (!row) throw new Error(`Quicklink ${id} not found`);
    return toQuicklink(row);
  }

  delete(id: number) {
    this.db.query("DELETE FROM quicklinks WHERE id = $id").run({ id });
  }
}

function validate(input: QuicklinkInput) {
  const name = input.name?.trim();
  const link = input.link?.trim();
  if (!name) throw new Error("Name is required");
  if (!link) throw new Error("Link is required");
  return { name, link, openWith: input.openWith?.trim() || null };
}

/** Expands placeholders; values are URL-encoded unless the link is a file path. */
export async function resolveLink(
  link: string,
  options: { argument?: string; now?: Date; readClipboard: () => Promise<string> },
): Promise<string> {
  const isFilePath = link.startsWith("/") || link.startsWith("~");
  const { text } = await render(link, {
    now: options.now ?? new Date(),
    readClipboard: options.readClipboard,
    argument: options.argument,
    encode: isFilePath ? undefined : encodeURIComponent,
  });
  return text.startsWith("~/") ? homedir() + text.slice(1) : text;
}
