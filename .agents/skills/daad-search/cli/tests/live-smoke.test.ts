import { expect, test } from "bun:test";
import { DEFAULT_CITIES } from "../src/query";
import { parseJSON, runCLI } from "./helpers";

// Live: one search page and one programme against the real site, so API or
// markup changes surface. When the site itself is down, the test is skipped
// with a note instead of failing on someone else's outage.
const probe = await fetch(
  "https://www2.daad.de/deutschland/studienangebote/international-programmes/api/solr/en/search.json?degree%5B%5D=2&limit=1",
  { headers: { "User-Agent": "Mozilla/5.0 (compatible; daad-cli/1.0)" }, signal: AbortSignal.timeout(20000) },
).then((r) => r.status, () => 0);
const siteDown = probe === 0 || probe >= 500;
if (siteDown) console.warn(`live smoke test skipped: www2.daad.de returned ${probe || "no response"}`);

test.skipIf(siteDown)("live search and detail return real programmes", async () => {
  const out = parseJSON<{ results: { id: string; location: string | null }[] }>(await runCLI(["search", "--pages", "1", "--limit", "5"]));
  expect(out.results.length).toBeGreaterThan(0);
  for (const p of out.results) {
    expect(p.id).toMatch(/^\d+$/);
    expect(DEFAULT_CITIES).toContain(p.location!);
  }
  const detail = parseJSON<{ id: string; title: string }>(await runCLI(["detail", out.results[0].id]));
  expect(detail.id).toBe(out.results[0].id);
  expect(detail.title).toBeTruthy();
});
