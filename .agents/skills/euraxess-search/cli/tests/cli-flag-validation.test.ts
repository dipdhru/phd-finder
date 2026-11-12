import { describe, test, expect } from "bun:test";
import { fixture, parseJSON, runCLI, runWithServer } from "./helpers";

type Card = { id: string; title: string; company: string | null; country: string | null; date: string | null; deadline: string | null; url: string; researchFields: string[]; fundingProgramme: string[] };
type Out = { meta: { count: number; pagesScanned: number; total: number | null }; results: Card[] };

const html = (body: string) => new Response(body, { headers: { "Content-Type": "text/html; charset=UTF-8" } });
const err = (stderr: string): { error?: string; code?: string } => {
  try {
    return JSON.parse(stderr);
  } catch {
    return {};
  }
};
/** The facet values a recorded search request asked for, e.g. ["offer_type:job_offer", "positions:php_positions"]. */
const facets = (url: URL) => [...url.searchParams.entries()].filter(([k]) => /^f\[\d+\]$/.test(k)).map(([, v]) => v);

describe("euraxess CLI flag validation", () => {
  test("unknown flag exits 1 with UNKNOWN_FLAG", async () => {
    const r = await runCLI(["search", "-q", "physics", "--salary", "high"]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toBe("");
    expect(err(r.stderr).code).toBe("UNKNOWN_FLAG");
  });

  for (const [name, value] of [["pages", "11"], ["jobage", "0"], ["page", "1.5"], ["level", "professor"], ["sort", "random"], ["country", "atlantis"], ["programme", "erasmus"], ["profile", "r9"]]) {
    test(`--${name} ${value} exits 1 with BAD_ARG`, async () => {
      const r = await runCLI(["search", `--${name}`, value]);
      expect(r.exitCode).toBe(1);
      expect(err(r.stderr).code).toBe("BAD_ARG");
    });
  }

  test("empty --query exits 1", async () => {
    expect((await runCLI(["search", "-q", ""])).exitCode).toBe(1);
  });

  test("detail rejects a URL on another host", async () => {
    const r = await runCLI(["detail", "https://euraxess.ec.europa.eu.evil.io/jobs/479677"]);
    expect(err(r.stderr).code).toBe("BAD_ID");
  });
});

describe("euraxess search", () => {
  test("flags become server-side facets; PhD is the default level", async () => {
    const page = await fixture("search.html");
    const { requests } = await runWithServer(
      ["search", "-q", "machine learning", "-c", "Germany,netherlands", "--profile", "r1", "--programme", "msca", "--pages", "1"],
      () => html(page),
    );
    expect(requests).toHaveLength(1);
    expect(requests[0].url.pathname).toBe("/jobs/search");
    expect(facets(requests[0].url)).toEqual([
      "offer_type:job_offer",
      "positions:php_positions",
      "job_country:794",
      "job_country:798",
      "job_research_profile:447",
      "job_is_eu_founded:4348",
      "keywords:machine learning",
    ]);
    expect(requests[0].url.searchParams.get("sort[name]")).toBe("created");
    expect(requests[0].url.searchParams.has("page")).toBe(false); // the site's pages are 0-indexed
  });

  test("--level any drops the positions facet; --page 3 asks for page=2", async () => {
    const page = await fixture("search.html");
    const { requests } = await runWithServer(["search", "--level", "any", "--page", "3", "--pages", "1"], () => html(page));
    expect(facets(requests[0].url)).toEqual(["offer_type:job_offer"]);
    expect(requests[0].url.searchParams.get("page")).toBe("2");
  });

  test("cards parse into the shared portal fields", async () => {
    const page = await fixture("search.html");
    const { result } = await runWithServer(["search", "--pages", "1"], () => html(page));
    const out = parseJSON<Out>(result);
    expect(out.meta.total).toBe(47);
    expect(out.results).toHaveLength(10);
    const first = out.results[0];
    expect(first).toMatchObject({
      id: "479677",
      company: "BIOWEG GmbH",
      country: "Germany",
      date: "2026-11-11",
      deadline: "2026-12-31",
      url: "https://euraxess.ec.europa.eu/jobs/479677",
    });
    expect(first.title).toStartWith("1 PhD Position in Biopolymer-Based Seed Coatings");
    expect(first.fundingProgramme).toEqual(["Horizon Europe - MSCA"]);
    for (const c of out.results) {
      for (const key of ["id", "title", "company", "location", "date", "url"]) expect(c).toHaveProperty(key);
      expect(JSON.stringify(c)).not.toContain("<");
    }
  });

  test("scanning stops at the last page by the result total, and repeats are emitted once", async () => {
    const page = await fixture("search.html");
    const { result, requests } = await runWithServer(["search", "--pages", "10"], () => html(page));
    expect(requests).toHaveLength(5); // 47 results, 10 per page
    expect(parseJSON<Out>(result).meta.count).toBe(10);
  });

  test("--location filters on the work location here", async () => {
    const page = await fixture("search.html");
    const { result } = await runWithServer(["search", "-l", "karlsruhe", "--pages", "1"], () => html(page));
    expect(parseJSON<Out>(result).results.map((r) => r.id)).toEqual(["478116"]);
  });

  test("--jobage stops at postings older than the window", async () => {
    // Shift every posted date to be N days old: the newest fixture card becomes today.
    const page = await fixture("search.html");
    const today = new Date();
    const fmt = (d: Date) => `${d.getUTCDate()} ${d.toLocaleString("en-GB", { month: "long", timeZone: "UTC" })} ${d.getUTCFullYear()}`;
    const shifted = page
      .replaceAll("Posted on: 11 November 2026", `Posted on: ${fmt(today)}`)
      .replace(/Posted on: (?:10|9|7|6|5) November 2026/g, `Posted on: ${fmt(new Date(today.getTime() - 20 * 86400000))}`);
    const { result, requests } = await runWithServer(["search", "--jobage", "3", "--pages", "5"], () => html(shifted));
    expect(requests).toHaveLength(1);
    expect(parseJSON<Out>(result).results.map((r) => r.id)).toEqual(["479677", "479666", "479662"]);
  });
});

describe("euraxess detail", () => {
  test("detail parses the job information, sections and funding hints", async () => {
    const page = await fixture("detail.html");
    const { result, requests } = await runWithServer(["detail", "https://euraxess.ec.europa.eu/jobs/479677"], () => html(page));
    expect(requests[0].url.pathname).toBe("/jobs/479677");
    const d = parseJSON<Record<string, unknown>>(result);
    expect(d).toMatchObject({
      id: "479677",
      company: "BIOWEG GmbH",
      country: "Germany",
      deadline: "2026-12-31",
      startDate: "2027-03-01",
      positions: ["PhD Positions"],
      fundingProgramme: ["Horizon Europe - MSCA"],
      mscaGrant: "101311807",
      applyUrl: "https://bioweg.jobs.personio.de/job/2877832?_pc=3429848#apply",
    });
    const signals = d.fundingSignals as { funded: string[]; unfunded: string[]; eligibility: string[] };
    expect(signals.funded).toContain("MSCA");
    expect(signals.funded).toContain("living allowance");
    expect(signals.unfunded).toEqual([]);
    expect(signals.eligibility).toContain("MSCA mobility rule");
    expect(String(d.description)).toContain("36-month fixed-term");
    expect(String(d.additionalInformation)).toContain("Mobility rule");
    // The page carries a display:none "STATUS: EXPIRED" template; it must not leak.
    expect(result.stdout).not.toContain("EXPIRED");
  });

  test("a 404 comes back NOT_FOUND", async () => {
    const { result } = await runWithServer(["detail", "1"], () => new Response("gone", { status: 404 }));
    expect(err(result.stderr).code).toBe("NOT_FOUND");
  });
});
