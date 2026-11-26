import { describe, expect, test } from "bun:test";
import { BASE } from "../src/helpers";
import { ParseError, isFree, parseDeadline, parseSearchResponse } from "../src/parse-search";
import { FIXTURE_DATE, fixture } from "./helpers";

const today = new Date("2026-11-26T12:00:00Z");

describe("parseDeadline", () => {
  test("parseDeadline: single future date is open", () => {
    expect(parseDeadline("Register by 1 June 2027", today)).toEqual({ deadline: "2027-06-01", status: "open" });
  });

  test("parseDeadline: past date with more dates is open", () => {
    expect(parseDeadline("Register by 15 August 2026 + 3 more", today)).toEqual({ deadline: "2026-08-15", status: "open" });
  });

  test("parseDeadline: past date alone is past", () => {
    expect(parseDeadline("Register by 15 August 2026", today)).toEqual({ deadline: "2026-08-15", status: "past" });
  });

  test("parseDeadline: no year or no deadline is unknown", () => {
    expect(parseDeadline("Application deadline for the winter semester: 1 June (first semester)", today)).toEqual({ deadline: null, status: "unknown" });
    expect(parseDeadline("This programme has no deadline.", today)).toEqual({ deadline: null, status: "unknown" });
    expect(parseDeadline(null, today)).toEqual({ deadline: null, status: "unknown" });
  });

  test("parseDeadline: same day is open", () => {
    expect(parseDeadline("Register by 26 November 2026", today).status).toBe("open");
  });
});

test("isFree accepts only 'No tuition fees'", () => {
  expect(isFree("No tuition fees")).toBe(true);
  expect(isFree(" no tuition FEES ")).toBe(true);
  expect(isFree("Tuition varies")).toBe(false);
  expect(isFree("9,950")).toBe(false);
  expect(isFree(null)).toBe(false);
});

describe("parseSearchResponse", () => {
  test("parseSearchResponse maps the real fixture", async () => {
    const { programmes, total } = parseSearchResponse(await fixture("search-p1.json"), FIXTURE_DATE);
    expect(programmes).toHaveLength(100);
    expect(total).toBeGreaterThanOrEqual(150);
    for (const p of programmes) {
      expect(p.id).toMatch(/^\d+$/);
      expect(p.url).toStartWith(`${BASE}/deutschland/studienangebote/international-programmes/en/detail/`);
      expect(p.title).toBeTruthy();
      expect(p.country).toBe("Germany");
      expect(p.deadlineText ?? "").not.toContain("<");
    }
    const dh = programmes.find((p) => p.id === "5252")!;
    expect(dh.title).toBe("Digital Health");
    expect(dh.company).toBe("University of Potsdam");
    expect(dh.location).toBe("Potsdam");
    expect(dh.tuitionFees).toBe("No tuition fees");
  });

  test("parseSearchResponse rejects non-JSON and JSON without courses", () => {
    expect(() => parseSearchResponse("<html>error</html>", today)).toThrow(ParseError);
    expect(() => parseSearchResponse('{"numResults":3}', today)).toThrow(ParseError);
  });
});

describe("review fixes: search parsing", () => {
  test("an application window reports its closing date, not its opening date", () => {
    expect(parseDeadline("Applications are possible from 1 November 2026 to 28 February 2027.", today)).toEqual({ deadline: "2027-02-28", status: "open" });
  });

  test("when every date has passed, the last one is reported", () => {
    expect(parseDeadline("1 May 2026 (first round) and 15 July 2026 (second round)", today)).toEqual({ deadline: "2026-07-15", status: "past" });
  });

  test("courses that all fail to map are a ParseError, not an empty result", () => {
    const body = JSON.stringify({ numResults: 2, courses: [{ name: "A" }, { name: "B" }] });
    expect(() => parseSearchResponse(body, today)).toThrow(ParseError);
  });

  test("the raw course count is returned for paging", async () => {
    const data = JSON.parse(await fixture("search-p1.json"));
    delete data.courses[0].courseName;
    const r = parseSearchResponse(JSON.stringify(data), today);
    expect(r.programmes).toHaveLength(99);
    expect(r.count).toBe(100);
  });
});
