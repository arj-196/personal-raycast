import { expect, test } from "bun:test";
import { matchScore, usageBoost } from "../src/fuzzy.ts";

test("match kinds rank exact > prefix > word > initials > substring > subsequence", () => {
  const scores = [
    matchScore("safari", "Safari"),
    matchScore("saf", "Safari"),
    matchScore("studio", "Visual Studio Code"),
    matchScore("vsc", "Visual Studio Code"),
    matchScore("fari", "Safari"),
    matchScore("sfr", "Safari"),
  ];
  for (let i = 1; i < scores.length; i++) expect(scores[i - 1]!).toBeGreaterThan(scores[i]!);
  expect(scores.at(-1)!).toBeGreaterThan(0);
});

test("camel case counts as word boundaries", () => {
  expect(matchScore("tp", "TablePlus")).toBeGreaterThan(matchScore("bl", "TablePlus"));
});

test("diacritics and case are ignored", () => {
  expect(matchScore("cafe", "Café")).toBe(1000);
});

test("non-matching returns 0", () => {
  expect(matchScore("xyz", "Safari")).toBe(0);
});

test("keywords match with a small discount", () => {
  expect(matchScore("new", "Create Snippet", ["new"])).toBe(900);
});

test("usage boost grows with count and decays with age", () => {
  const now = Date.now();
  const recent = usageBoost({ count: 8, lastUsedAt: now }, now);
  const stale = usageBoost({ count: 8, lastUsedAt: now - 60 * 24 * 3600 * 1000 }, now);
  expect(recent).toBeGreaterThan(stale);
  expect(usageBoost({ count: 100, lastUsedAt: now }, now)).toBeLessThanOrEqual(180);
  expect(usageBoost(undefined)).toBe(0);
});
