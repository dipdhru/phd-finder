import { describe, expect, test } from "bun:test";
import { err, fixture, html, parseJSON, runCLI, runWithServer } from "./helpers";

type Out = { meta: { count: number; page: number; pagesScanned: number; total: number | null }; results: { id: string; title: string }[] };

const params = (url: URL) => Object.fromEntries(url.searchParams.entries());
/** The fixture with the job count replaced, or cut to its first `keep` cards. */
async function page(opts: { total?: number; keep?: number } = {}) {
  let s = await fixture("search.html");
  if (opts.total !== undefined) s = s.replace(/<strong class="job-count">\d+<\/strong>/g, `<strong class="job-count">${opts.total}</strong>`);
  if (opts.keep !== undefined) {
    const parts = s.split('class="j-search-result__result');
    s = parts.slice(0, opts.keep + 1).join('class="j-search-result__result');
  }
  return s;
}

describe("search requests", () => {
  test("defaults: PhD, international funding, newest first, first 25", async () => {
    const body = await page();
    const { result, requests } = await runWithServer(["search", "--pages", "1"], () => html(body));
    expect(result.exitCode).toBe(0);
    expect(requests).toHaveLength(1);
    expect(requests[0].url.pathname).toBe("/search/");
    expect(params(requests[0].url)).toEqual({
      sortOrder: "1",
      pageSize: "25",
      startIndex: "1",
      "jobTypeFacet[0]": "phds",
      "fundingTypeFacet[0]": "international-students",
    });
  });

  test("flags map to facets", async () => {
    const body = await page();
    const { requests } = await runWithServer(
      ["search", "-q", "clinical nlp", "--type", "masters", "--funding", "any", "--discipline", "health-and-medical", "--location", "UK", "--sort", "closing", "--pages", "1"],
      () => html(body),
    );
    expect(params(requests[0].url)).toEqual({
      sortOrder: "2",
      pageSize: "25",
      startIndex: "1",
      keywords: "clinical nlp",
      "jobTypeFacet[0]": "masters",
      "academicDisciplineFacet[0]": "health-and-medical",
      "locationFacet[0]": "united-kingdom",
    });
  });

  test("--type any scans PhDs, then masters", async () => {
    const body = await page({ total: 25 });
    const { requests } = await runWithServer(["search", "--type", "any"], () => html(body));
    expect(requests.map((r) => r.url.searchParams.get("jobTypeFacet[0]"))).toEqual(["phds", "masters"]);
  });

  test("--pages 3 asks for startIndex 1, 26, 51 and outputs a repeated card once", async () => {
    const body = await page();
    const { result, requests } = await runWithServer(["search", "--pages", "3"], () => html(body));
    expect(requests.map((r) => r.url.searchParams.get("startIndex"))).toEqual(["1", "26", "51"]);
    const out = parseJSON<Out>(result);
    expect(out.meta.pagesScanned).toBe(3);
    expect(out.results).toHaveLength(25);
  });

  test("--page 2 starts at startIndex 26", async () => {
    const body = await page();
    const { requests } = await runWithServer(["search", "--page", "2", "--pages", "1"], () => html(body));
    expect(requests[0].url.searchParams.get("startIndex")).toBe("26");
  });

  test("stops paging at the reported total", async () => {
    const body = await page({ total: 30 });
    const { requests } = await runWithServer(["search", "--pages", "5"], () => html(body));
    expect(requests).toHaveLength(2);
  });

  test("stops after a short page", async () => {
    const full = await page();
    const short = await page({ keep: 3 });
    const { requests } = await runWithServer(["search", "--pages", "5"], (url) =>
      html(url.searchParams.get("startIndex") === "1" ? full : short),
    );
    expect(requests).toHaveLength(2);
  });

  test("--limit caps output and stops scanning", async () => {
    const body = await page();
    const { result, requests } = await runWithServer(["search", "--limit", "5", "--pages", "3"], () => html(body));
    expect(parseJSON<Out>(result).results).toHaveLength(5);
    expect(requests).toHaveLength(1);
  });
});

describe("search failures", () => {
  test("503 then 200 succeeds via the retry", async () => {
    const body = await page();
    let n = 0;
    const { result, requests } = await runWithServer(["search", "--pages", "1"], () => (n++ === 0 ? html("down", 503) : html(body)));
    expect(result.exitCode).toBe(0);
    expect(requests).toHaveLength(2);
  });

  test("persistent failure exits 1 with SEARCH_FAILED and empty stdout", async () => {
    const { result } = await runWithServer(["search", "--pages", "3"], () => html("down", 503));
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(err(result.stderr).code).toBe("SEARCH_FAILED");
  });

  test("failure on a later page still writes nothing to stdout", async () => {
    const body = await page();
    const { result } = await runWithServer(["search", "--pages", "3"], (url) =>
      url.searchParams.get("startIndex") === "1" ? html(body) : html("down", 503),
    );
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(err(result.stderr).code).toBe("SEARCH_FAILED");
  });
});

describe("unreadable results pages", () => {
  test("a 200 page with no cards and no count exits 1 with PARSE_FAILED", async () => {
    const { result } = await runWithServer(["search"], () => html("<html><body>maintenance</body></html>"));
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(err(result.stderr).code).toBe("PARSE_FAILED");
  });

  test("a count above zero with no readable cards exits 1 with PARSE_FAILED", async () => {
    const { result } = await runWithServer(["search"], () => html('<strong class="job-count">5</strong> PhDs Found'));
    expect(result.exitCode).toBe(1);
    expect(err(result.stderr).code).toBe("PARSE_FAILED");
  });

  test("a genuine empty result (count 0) is a normal empty answer", async () => {
    const { result } = await runWithServer(["search"], () => html('<strong class="job-count">0</strong> PhDs Found'));
    expect(parseJSON<Out>(result).results).toEqual([]);
  });
});

describe("search output", () => {
  test("table and plain formats render the first card's id and title", async () => {
    const body = await page();
    for (const format of ["table", "plain"]) {
      const { result } = await runWithServer(["search", "--pages", "1", "--format", format], () => html(body));
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("DTS716");
      expect(result.stdout).toContain("School of Performance and Cultural Industries");
    }
  });
});

describe("flag validation", () => {
  const bad = [
    ["--pages", "11"], ["--page", "0"], ["--type", "professor"], ["--funding", "rich"],
    ["--discipline", "astrology"], ["--sort", "random"], ["--location", ""], ["--format", "xml"], ["-q", ""],
  ];
  for (const flag of bad) {
    test(`${flag.join(" ")} exits 1 with BAD_ARG`, async () => {
      const r = await runCLI(["search", ...flag]);
      expect(r.exitCode).toBe(1);
      expect(r.stdout).toBe("");
      expect(err(r.stderr).code).toBe("BAD_ARG");
    });
  }

  test("euraxess-only flag --country is rejected with UNKNOWN_FLAG", async () => {
    const r = await runCLI(["search", "--country", "germany"]);
    expect(r.exitCode).toBe(1);
    expect(err(r.stderr).code).toBe("UNKNOWN_FLAG");
  });
});
