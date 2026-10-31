import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import type { App } from "./types.ts";

export const DEFAULT_APP_DIRS = [
  "/Applications",
  "/Applications/Utilities",
  "/System/Applications",
  "/System/Applications/Utilities",
  join(homedir(), "Applications"),
];

const EXTRA_APPS = ["/System/Library/CoreServices/Finder.app"];
const RESCAN_AFTER_MS = 5 * 60 * 1000;

/** Finds .app bundles, descending one level into plain folders (e.g. "/Applications/Adobe Foo/"). */
export async function scanApplications(dirs: readonly string[] = DEFAULT_APP_DIRS): Promise<App[]> {
  const found = new Map<string, App>();
  const add = (path: string) => found.set(path, { name: basename(path, ".app"), path });

  async function walk(dir: string, depth: number) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    await Promise.all(
      entries.map(async (entry) => {
        if (entry.name.startsWith(".")) return;
        const path = join(dir, entry.name);
        if (entry.name.endsWith(".app")) add(path);
        else if (depth > 0 && (entry.isDirectory() || entry.isSymbolicLink())) await walk(path, depth - 1);
      }),
    );
  }

  await Promise.all(dirs.map((dir) => walk(dir, 1)));
  for (const path of EXTRA_APPS) if (await Bun.file(join(path, "Contents/Info.plist")).exists()) add(path);
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export class AppIndex {
  private apps: App[] = [];
  private scannedAt = 0;
  private scanning: Promise<void> | null = null;

  constructor(private dirs: readonly string[] = DEFAULT_APP_DIRS) {}

  async list(): Promise<App[]> {
    if (this.scannedAt === 0) await this.reload();
    else if (Date.now() - this.scannedAt > RESCAN_AFTER_MS) void this.reload();
    return this.apps;
  }

  reload(): Promise<void> {
    this.scanning ??= scanApplications(this.dirs)
      .then((apps) => {
        this.apps = apps;
        this.scannedAt = Date.now();
      })
      .finally(() => {
        this.scanning = null;
      });
    return this.scanning;
  }
}
