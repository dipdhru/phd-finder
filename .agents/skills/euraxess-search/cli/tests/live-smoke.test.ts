import { expect, test } from "bun:test";
import { parseJSON, runCLI } from "./helpers";

// Live: one search page and one detail page against the real site, so markup changes surface.
test("live search and detail return real offers with ids, titles and portal URLs", async () => {
  const out = parseJSON<{ results: { id: string; title: string; url: string; date: string | null }[] }>(
    await runCLI(["search", "-c", "germany", "--pages", "1", "--limit", "5"]),
  );
  expect(out.results.length).toBeGreaterThan(0);
  for (const job of out.results) {
    expect(job.id).toMatch(/^\d+$/);
    expect(job.title).toBeTruthy();
    expect(job.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(job.url).toStartWith("https://euraxess.ec.europa.eu/jobs/");
  }
  const detail = parseJSON<{ id: string; title: string; description: string | null }>(
    await runCLI(["detail", out.results[0].id]),
  );
  expect(detail.id).toBe(out.results[0].id);
  expect(detail.title).toBeTruthy();
});
