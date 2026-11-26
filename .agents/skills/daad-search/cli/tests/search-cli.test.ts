import { describe, expect, test } from "bun:test";
import { DEFAULT_CITIES } from "../src/query";
import { err, fixture, html, json, parseJSON, runCLI, runWithServer } from "./helpers";

type Result = { id: string; title: string; tuitionFees: string | null; beginning: string | null; deadlineStatus: string };
type Out = { meta: { count: number; pagesScanned: number; total: number }; results: Result[] };

/** Serve p1 at offset 0 and p2 at offset 100. */
async function pages() {
  const p1 = await fixture("search-p1.json");
  const p2 = await fixture("search-p2.json");
  return (url: URL) => json(url.searchParams.get("offset") === "100" ? p2 : p1);
}

describe("search requests", () => {
  test("default request: master's, English, the 8 cities, first 100", async () => {
    const serve = await pages();
    const { result, requests } = await runWithServer(["search", "--pages", "1"], serve);
    expect(result.exitCode).toBe(0);
    const q = requests[0].url.searchParams;
    expect(requests[0].url.pathname).toEndWith("/api/solr/en/search.json");
    expect(q.getAll("degree[]")).toEqual(["2"]);
    expect(q.getAll("lang[]")).toEqual(["2"]);
    expect(q.getAll("cit[]")).toEqual(DEFAULT_CITIES);
    expect(q.get("limit")).toBe("100");
    expect(q.get("offset")).toBe("0");
    expect(q.get("sort")).toBe("4");
    expect(q.get("display")).toBe("list");
    expect(q.has("q")).toBe(false);
  });

  test("--city maps case-insensitively and keeps unknown names", async () => {
    const serve = await pages();
    const { requests } = await runWithServer(["search", "--city", "potsdam,frankfurt (oder),Leipzig", "--pages", "1"], serve);
    expect(requests[0].url.searchParams.getAll("cit[]")).toEqual(["Potsdam", "Frankfurt (Oder)", "Leipzig"]);
  });

  test("-q is sent as q", async () => {
    const serve = await pages();
    const { requests } = await runWithServer(["search", "-q", "data science", "--pages", "1"], serve);
    expect(requests[0].url.searchParams.get("q")).toBe("data science");
  });

  test("pages through offset 0, 100 and stops at numResults", async () => {
    const serve = await pages();
    const { result, requests } = await runWithServer(["search", "--pages", "5", "--fees", "any"], serve);
    expect(requests.map((r) => r.url.searchParams.get("offset"))).toEqual(["0", "100"]);
    const out = parseJSON<Out>(result);
    expect(new Set(out.results.map((r) => r.id)).size).toBe(out.results.length);
    expect(out.results).toHaveLength(177);
  });

  test("a repeated course is output once", async () => {
    const p1 = JSON.parse(await fixture("search-p1.json"));
    p1.numResults = 300;
    const { result, requests } = await runWithServer(["search", "--pages", "2", "--fees", "any"], () => json(p1));
    expect(requests).toHaveLength(2);
    const ids = parseJSON<Out>(result).results.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(100);
  });

  test("--limit stops after the first page that fills it", async () => {
    const serve = await pages();
    const { result, requests } = await runWithServer(["search", "--limit", "5"], serve);
    expect(requests).toHaveLength(1);
    expect(parseJSON<Out>(result).results).toHaveLength(5);
  });
});

describe("search filters", () => {
  test("--fees free is the default and keeps only tuition-free programmes", async () => {
    const serve = await pages();
    const free = parseJSON<Out>((await runWithServer(["search"], serve)).result);
    expect(free.results.length).toBeGreaterThan(0);
    for (const r of free.results) expect(r.tuitionFees).toBe("No tuition fees");
    const any = parseJSON<Out>((await runWithServer(["search", "--fees", "any"], serve)).result);
    expect(any.results.some((r) => r.tuitionFees !== "No tuition fees")).toBe(true);
  });

  test("--start winter keeps only programmes starting in winter", async () => {
    const serve = await pages();
    const out = parseJSON<Out>((await runWithServer(["search", "--start", "winter"], serve)).result);
    expect(out.results.length).toBeGreaterThan(0);
    for (const r of out.results) expect(r.beginning).toMatch(/winter/i);
  });

  test("--open-only drops past deadlines", async () => {
    const serve = await pages();
    const all = parseJSON<Out>((await runWithServer(["search", "--fees", "any"], serve)).result);
    expect(all.results.some((r) => r.deadlineStatus === "past")).toBe(true);
    const open = parseJSON<Out>((await runWithServer(["search", "--fees", "any", "--open-only"], serve)).result);
    expect(open.results.some((r) => r.deadlineStatus === "past")).toBe(false);
  });
});

describe("search failures", () => {
  for (const [name, body] of [["HTML", "<html><body>maintenance</body></html>"], ["courses-less JSON", '{"numResults":3}']]) {
    test(`${name} with status 200 exits 1 with PARSE_FAILED and empty stdout`, async () => {
      const { result } = await runWithServer(["search"], () => html(body));
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(err(result.stderr).code).toBe("PARSE_FAILED");
    });
  }

  test("persistent 503 exits 1 with SEARCH_FAILED and empty stdout", async () => {
    const { result } = await runWithServer(["search"], () => html("down", 503));
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(err(result.stderr).code).toBe("SEARCH_FAILED");
  });
});

describe("search output and flags", () => {
  test("table and plain show the Digital Health row", async () => {
    const serve = await pages();
    for (const format of ["table", "plain"]) {
      const { result } = await runWithServer(["search", "--format", format], serve);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Digital Health");
      expect(result.stdout).toContain("University of Potsdam");
    }
  });

  const bad = [["--pages", "11"], ["--fees", "cheap"], ["--start", "spring"], ["--city", ""], ["-q", ""], ["--format", "xml"]];
  for (const flag of bad) {
    test(`${flag.join(" ")} exits 1 with BAD_ARG`, async () => {
      const r = await runCLI(["search", ...flag]);
      expect(r.exitCode).toBe(1);
      expect(r.stdout).toBe("");
      expect(err(r.stderr).code).toBe("BAD_ARG");
    });
  }

  test("--level is rejected with UNKNOWN_FLAG", async () => {
    const r = await runCLI(["search", "--level", "phd"]);
    expect(err(r.stderr).code).toBe("UNKNOWN_FLAG");
  });
});
