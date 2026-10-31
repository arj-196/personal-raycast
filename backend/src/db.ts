import { Database } from "bun:sqlite";

// Append only. The quicklinks table is unused since the launcher went snippets-only; it stays so
// existing databases keep their data and migrate cleanly.
const MIGRATIONS = [
  `CREATE TABLE snippets (
     id INTEGER PRIMARY KEY,
     name TEXT NOT NULL,
     text TEXT NOT NULL,
     keyword TEXT UNIQUE,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   );
   CREATE TABLE quicklinks (
     id INTEGER PRIMARY KEY,
     name TEXT NOT NULL,
     link TEXT NOT NULL,
     open_with TEXT,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   );
   CREATE TABLE usage (
     item_id TEXT PRIMARY KEY,
     count INTEGER NOT NULL,
     last_used_at INTEGER NOT NULL
   );`,
  // One row per setting, the value JSON-encoded.
  `CREATE TABLE settings (
     key TEXT PRIMARY KEY,
     value TEXT NOT NULL
   );`,
];

export function openDatabase(path: string): Database {
  const db = new Database(path, { create: true, strict: true });
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  const { user_version } = db.query("PRAGMA user_version").get() as { user_version: number };
  for (let version = user_version; version < MIGRATIONS.length; version++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[version]!);
      db.exec(`PRAGMA user_version = ${version + 1}`);
    })();
  }
  return db;
}

export type UsageRow = { count: number; lastUsedAt: number };

export class UsageStore {
  constructor(private db: Database) {}

  record(itemId: string, now = Date.now()) {
    this.db
      .query(
        `INSERT INTO usage (item_id, count, last_used_at) VALUES ($itemId, 1, $now)
         ON CONFLICT(item_id) DO UPDATE SET count = count + 1, last_used_at = $now`,
      )
      .run({ itemId, now });
  }

  all(): Map<string, UsageRow> {
    const rows = this.db.query("SELECT item_id, count, last_used_at FROM usage").all() as {
      item_id: string;
      count: number;
      last_used_at: number;
    }[];
    return new Map(rows.map((r) => [r.item_id, { count: r.count, lastUsedAt: r.last_used_at }]));
  }

  forget(itemId: string) {
    this.db.query("DELETE FROM usage WHERE item_id = $itemId").run({ itemId });
  }
}
