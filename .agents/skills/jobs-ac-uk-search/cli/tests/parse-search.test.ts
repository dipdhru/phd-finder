import { expect, test } from "bun:test";
import { inferDate, parseSearchPage } from "../src/parse-search";
import { FIXTURE_DATE, fixture } from "./helpers";

test("inferDate: placed date rolls back a year rather than land in the future", () => {
  expect(inferDate("20 Dec", new Date("2027-01-05"), "past")).toBe("2026-12-20");
});

test("inferDate: closing date rolls forward over New Year", () => {
  expect(inferDate("09 Jan", new Date("2026-12-20"), "future")).toBe("2027-01-09");
});

test("inferDate: same day counts for both directions", () => {
  const ref = new Date("2026-11-21");
  expect(inferDate("21 Nov", ref, "past")).toBe("2026-11-21");
  expect(inferDate("21 Nov", ref, "future")).toBe("2026-11-21");
});

test("inferDate: rejects bad input", () => {
  const ref = new Date("2026-11-21");
  expect(inferDate("31 Feb", ref, "past")).toBeNull();
  expect(inferDate("soon", ref, "future")).toBeNull();
});

test("parseSearchPage reads every card of the real fixture", async () => {
  const { cards, total } = parseSearchPage(await fixture("search.html"), FIXTURE_DATE);
  expect(cards).toHaveLength(25);
  expect(Number.isInteger(total)).toBe(true);
  expect(total!).toBeGreaterThanOrEqual(25);
  const today = FIXTURE_DATE.toISOString().slice(0, 10);
  for (const c of cards) {
    expect(c.id).toMatch(/^[A-Z]{2,4}\d{2,5}$/);
    expect(c.url).toBe(`https://www.jobs.ac.uk/job/${c.id}`);
    expect(c.title).toBeTruthy();
    expect(c.company).toBeTruthy();
    expect(c.country).toBeNull();
    expect(c.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(c.date! <= today).toBe(true);
    if (c.deadline !== null) expect(c.deadline >= c.date!).toBe(true);
  }
});

test("a card without a Closes span has deadline null", async () => {
  const page = (await fixture("search.html")).replace(/<span class="j-search-result__date-span j-search-result__date--blue[^"]*">[^<]*<\/span>/, "");
  expect(parseSearchPage(page, FIXTURE_DATE).cards[0].deadline).toBeNull();
});

test("a page with no cards gives an empty list and its total", () => {
  expect(parseSearchPage('<h2><strong class="job-count">0</strong> PhDs Found</h2>', FIXTURE_DATE)).toEqual({ cards: [], total: 0 });
});
