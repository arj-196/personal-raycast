import type { UsageRow } from "./db.ts";

const DAY = 24 * 60 * 60 * 1000;

export function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Scores how well `term` matches `title`. 0 means no match.
 * Order: exact > prefix > word prefix > initials > substring > subsequence.
 */
export function matchScore(term: string, title: string, keywords: readonly string[] = []): number {
  const query = normalize(term.trim());
  if (!query) return 1;
  let best = scoreAgainst(query, title);
  for (const keyword of keywords) best = Math.max(best, scoreAgainst(query, keyword) * 0.9);
  return best;
}

function scoreAgainst(query: string, original: string): number {
  const text = normalize(original);
  const lengthPenalty = Math.min(text.length - query.length, 50);
  if (text === query) return 1000;
  if (text.startsWith(query)) return 800 - lengthPenalty;

  const words = normalize(original.replace(/([a-z])([A-Z])/g, "$1 $2"))
    .split(/[\s\-_.()]+/)
    .filter(Boolean);
  if (words.some((word) => word.startsWith(query))) return 600 - lengthPenalty;
  if (words.map((word) => word[0]).join("").startsWith(query)) return 500 - lengthPenalty;
  if (text.includes(query)) return 300 - lengthPenalty;

  let matched = 0;
  let gaps = 0;
  let last = -1;
  for (let i = 0; i < text.length && matched < query.length; i++) {
    if (text[i] !== query[matched]) continue;
    if (last >= 0 && i !== last + 1) gaps++;
    last = i;
    matched++;
  }
  return matched === query.length ? Math.max(100 - gaps * 15, 10) : 0;
}

/** Frecency bonus added on top of match score; capped so a strong match always wins. */
export function usageBoost(usage: UsageRow | undefined, now = Date.now()): number {
  if (!usage) return 0;
  const age = now - usage.lastUsedAt;
  const recency = age < DAY ? 1 : age < 7 * DAY ? 0.8 : age < 30 * DAY ? 0.6 : 0.4;
  return Math.min(180, 40 * Math.log2(1 + usage.count)) * recency;
}
