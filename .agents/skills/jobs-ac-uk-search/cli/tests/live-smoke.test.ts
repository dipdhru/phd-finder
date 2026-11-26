import { expect, test } from "bun:test";
import { parseJSON, runCLI } from "./helpers";

// Live: one search page and one advert against the real site, so markup
// changes surface. When the site itself is down, the test is skipped with a
// note instead of failing on someone else's outage. In the late-November 2026
// security incident it first answered 500 everywhere, then redirected every
// search (307) to a homepage outage notice, so a redirect away from /search
// counts as down too.
const probe = await fetch("https://www.jobs.ac.uk/search/phds", {
  headers: { "User-Agent": "Mozilla/5.0 (compatible; jobs-ac-uk-cli/1.0)" },
  redirect: "manual",
  signal: AbortSignal.timeout(20000),
}).then(
  (r) => ({ status: r.status, location: r.headers.get("location") }),
  () => ({ status: 0, location: null as string | null }),
);
const redirectedAway = probe.status >= 300 && probe.status < 400 && !/\/search\b/.test(probe.location ?? "");
const siteDown = probe.status === 0 || probe.status >= 500 || redirectedAway;
if (siteDown) {
  const why = probe.status === 0 ? "no response" : redirectedAway ? `${probe.status} redirect to ${probe.location}` : String(probe.status);
  console.warn(`live smoke test skipped: www.jobs.ac.uk returned ${why}`);
}

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
