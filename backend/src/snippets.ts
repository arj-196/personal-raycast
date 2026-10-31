import type { Database } from "bun:sqlite";
import { matchScore } from "./fuzzy.ts";
import type { Snippet } from "./types.ts";

type Row = { id: number; name: string; text: string; keyword: string | null; created_at: number; updated_at: number };
export type SnippetInput = { name: string; text: string; keyword?: string | null };

const toSnippet = (row: Row): Snippet => ({
  id: row.id,
  name: row.name,
  text: row.text,
  keyword: row.keyword,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class SnippetStore {
  constructor(private db: Database) {}

  list(term = ""): Snippet[] {
    const all = (this.db.query("SELECT * FROM snippets ORDER BY name COLLATE NOCASE").all() as Row[]).map(toSnippet);
    if (!term.trim()) return all;
    return all
      .map((snippet) => ({
        snippet,
        score: Math.max(matchScore(term, snippet.name, snippet.keyword ? [snippet.keyword] : []), matchScore(term, snippet.text) * 0.5),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.snippet);
  }

  get(id: number): Snippet {
    const row = this.db.query("SELECT * FROM snippets WHERE id = $id").get({ id }) as Row | null;
    if (!row) throw new Error(`Snippet ${id} not found`);
    return toSnippet(row);
  }

  getByKeyword(keyword: string): Snippet | null {
    const row = this.db.query("SELECT * FROM snippets WHERE keyword = $keyword").get({ keyword }) as Row | null;
    return row ? toSnippet(row) : null;
  }

  isKeywordAvailable(keyword: string, excludeId?: number): boolean {
    const existing = this.getByKeyword(keyword.trim());
    return !existing || existing.id === excludeId;
  }

  create(input: SnippetInput, now = Date.now()): Snippet {
    const values = this.validate(input);
    const row = this.db
      .query(
        `INSERT INTO snippets (name, text, keyword, created_at, updated_at)
         VALUES ($name, $text, $keyword, $now, $now) RETURNING *`,
      )
      .get({ ...values, now }) as Row;
    return toSnippet(row);
  }

  update(id: number, input: SnippetInput, now = Date.now()): Snippet {
    const values = this.validate(input, id);
    const row = this.db
      .query(
        `UPDATE snippets SET name = $name, text = $text, keyword = $keyword, updated_at = $now
         WHERE id = $id RETURNING *`,
      )
      .get({ ...values, now, id }) as Row | null;
    if (!row) throw new Error(`Snippet ${id} not found`);
    return toSnippet(row);
  }

  delete(id: number) {
    this.db.query("DELETE FROM snippets WHERE id = $id").run({ id });
  }

  keywords(): string[] {
    return (this.db.query("SELECT keyword FROM snippets WHERE keyword IS NOT NULL").all() as { keyword: string }[]).map(
      (row) => row.keyword,
    );
  }

  private validate(input: SnippetInput, excludeId?: number) {
    const name = input.name?.trim();
    const text = input.text ?? "";
    const keyword = input.keyword?.trim() || null;
    if (!name) throw new Error("Name is required");
    if (!text) throw new Error("Snippet text is required");
    if (keyword !== null) {
      if (/\s/.test(keyword)) throw new Error("Keyword can't contain spaces");
      const owner = this.getByKeyword(keyword);
      if (owner && owner.id !== excludeId) throw new Error(`Keyword is already used by “${owner.name}”`);
    }
    return { name, text, keyword };
  }
}
