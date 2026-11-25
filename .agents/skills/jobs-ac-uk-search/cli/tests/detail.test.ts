import { describe, expect, test } from "bun:test";
import { normalizeId } from "../src/commands/detail";
import { fundingSignals, parseDetail, parseUkDate } from "../src/parse-detail";
import { err, fixture, html, runCLI, runWithServer } from "./helpers";

describe("parseDetail", () => {
  test("parseDetail reads the UK-home-only fixture", async () => {
    const d = parseDetail(await fixture("detail-uk-home.html"), "DTS352")!;
    expect(d.title).toStartWith("PG Funding: PhD Studentship - Process Industries");
    expect(d.company).toBe("Newcastle University");
    expect(d.location).toBe("Newcastle upon Tyne, England");
    expect(d.country).toBe("United Kingdom");
    expect(d.date).toBe("2026-11-19");
    expect(d.deadline).toBe("2027-01-27");
    expect(d.url).toBe("https://www.jobs.ac.uk/job/DTS352");
    expect(d.qualification).toBe("PhD");
    expect(d.fundingFor).toEqual(["UK Students"]);
    expect(d.fundingAmount).toBe("£21,805 - please see advert");
    expect(d.hours).toBe("Full Time");
    expect(d.reference).toBe("PINZ06-27");
    expect(d.startDate).toBe("2027-10-01");
    expect(d.duration).toBe("4 years");
    expect(d.sponsor).toBe("EPSRC");
    expect(d.supervisors).toEqual(["Dr. Othman Al Musaimi (Othman.Almusaimi@newcastle.ac.uk)"]);
    expect(d.eligibility).toContain("minimum 2:1 Honours degree");
    expect(d.applyUrl).toStartWith("https://www.ncl.ac.uk/postgraduate/fees-funding/");
    expect(d.description).toContain("GLP-1");
    expect(d.fundingSignals.funded).toEqual(expect.arrayContaining(["UKRI rate", "tax-free stipend", "living allowance"]));
    expect(d.fundingSignals.eligibility).toEqual(expect.arrayContaining(["home fees only", "UK students only"]));
  });

  test("skips broken and non-JobPosting JSON-LD blocks", async () => {
    const page = (await fixture("detail-uk-home.html")).replace(
      '<script type="application/ld+json">',
      '<script type="application/ld+json">{not json</script><script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[]}</script>$&',
    );
    const d = parseDetail(page, "DTS352")!;
    expect(d.title).toStartWith("PG Funding: PhD Studentship");
    expect(d.company).toBe("Newcastle University");
  });

  test("a page without JobPosting data gives null", () => {
    expect(parseDetail("<html><body>changed</body></html>", "DTS352")).toBeNull();
  });
});

describe("signals and dates", () => {
  test("fundingSignals flags international eligibility and home-rate fees in plain text", () => {
    const s = fundingSignals("International applicants are eligible. Fees are paid at the home rate.");
    expect(s.eligibility).toEqual(expect.arrayContaining(["international students eligible", "home fees only"]));
  });

  test("a negated international-eligibility sentence is not read as eligible", () => {
    for (const text of ["International students are not eligible for this studentship.", "International applicants are not eligible to apply."]) {
      const s = fundingSignals(text);
      expect(s.eligibility).toContain("international students not eligible");
      expect(s.eligibility).not.toContain("international students eligible");
    }
  });

  test("home-rate fees with the international difference covered or waived are not 'home fees only'", () => {
    for (const text of [
      "Home fees and international fees are both covered.",
      "UKRI funding covers fees at the home rate; the University will waive the difference for international students.",
    ]) {
      expect(fundingSignals(text).eligibility).not.toContain("home fees only");
    }
  });

  test("other home-rate phrasings are caught as 'home fees only'", () => {
    for (const text of [
      "The award covers UK home tuition fees and a stipend.",
      "Includes home-rate fees.",
      "Tuition fees at the UK rate only.",
      // Welcoming international students is not a fee waiver.
      "International students are welcome; fees are paid at the home rate.",
    ]) {
      expect(fundingSignals(text).eligibility).toContain("home fees only");
    }
  });

  test("parseUkDate handles ordinals and split ordinals", () => {
    expect(parseUkDate("19th November 2026")).toBe("2026-11-19");
    expect(parseUkDate("1 st October 2027")).toBe("2027-10-01");
    expect(parseUkDate("27 January 2027")).toBe("2027-01-27");
    expect(parseUkDate("sometime")).toBeNull();
    expect(parseUkDate(null)).toBeNull();
  });
});

describe("detail command", () => {
  test("no JobPosting data → CLI exits 1 with PARSE_FAILED", async () => {
    const { result } = await runWithServer(["detail", "DTS352"], () => html("<html><body>changed</body></html>"));
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(err(result.stderr).code).toBe("PARSE_FAILED");
  });

  test("404 → CLI exits 1 with NOT_FOUND", async () => {
    const { result } = await runWithServer(["detail", "DTS352"], () => html("gone", 404));
    expect(result.exitCode).toBe(1);
    expect(err(result.stderr).code).toBe("NOT_FOUND");
  });

  test("detail requests /job/<ID> and plain format shows the home-fees warning", async () => {
    const page = await fixture("detail-uk-home.html");
    const { result, requests } = await runWithServer(["detail", "dts352", "--format", "plain"], () => html(page));
    expect(result.exitCode).toBe(0);
    expect(requests[0].url.pathname).toBe("/job/DTS352");
    expect(result.stdout).toContain("home fees only");
  });

  test("normalizeId", () => {
    expect(normalizeId("dts352")).toBe("DTS352");
    expect(normalizeId("https://www.jobs.ac.uk/job/DTS352/some-slug")).toBe("DTS352");
    expect(normalizeId("jobs.ac.uk/job/DTS352")).toBe("DTS352");
    expect(normalizeId("https://www.jobs.ac.uk.evil.io/job/DTS352")).toBeNull();
    expect(normalizeId("https://evil.io/job/DTS352")).toBeNull();
    expect(normalizeId("12345")).toBeNull();
  });

  test("detail with a bad id exits 1 with BAD_ID", async () => {
    const r = await runCLI(["detail", "https://evil.io/job/DTS352"]);
    expect(r.exitCode).toBe(1);
    expect(err(r.stderr).code).toBe("BAD_ID");
  });
});
