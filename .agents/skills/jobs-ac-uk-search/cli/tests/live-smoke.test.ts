import { expect, test } from "bun:test";
import { parseJSON, runCLI } from "./helpers";

// Live: one search page and one advert against the real site, so markup
// changes surface. When the site itself is down (it was offline for a
// security incident in late November 2026), the test is skipped with a note
// instead of failing on someone else's outage.
const probe = await fetch("https://www.jobs.ac.uk/search/phds", {
  headers: { "User-Agent": "Mozilla/5.0 (compatible; jobs-ac-uk-cli/1.0)" },
  signal: AbortSignal.timeout(20000),
}).then((r) => r.status, () => 0);
const siteDown = probe === 0 || probe >= 500;
if (siteDown) console.warn(`live smoke test skipped: www.jobs.ac.uk returned ${probe || "no response"}`);

test.skipIf(siteDown)("live search and detail return real studentships", async () => {
  const out = parseJSON<{ results: { id: string; url: string; date: string | null }[] }>(
    await runCLI(["search", "--pages", "1", "--limit", "5"]),
  );
  expect(out.results.length).toBeGreaterThan(0);
  for (const job of out.results) {
    expect(job.id).toMatch(/^[A-Z]{2,4}\d{2,5}$/);
    expect(job.url).toStartWith("https://www.jobs.ac.uk/job/");
    expect(job.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  }
  const detail = parseJSON<{ id: string; title: string; deadline: string | null }>(await runCLI(["detail", out.results[0].id]));
  expect(detail.id).toBe(out.results[0].id);
  expect(detail.title).toBeTruthy();
  if (detail.deadline !== null) expect(detail.deadline).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});
