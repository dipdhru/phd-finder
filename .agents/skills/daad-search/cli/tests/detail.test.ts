import { describe, expect, test } from "bun:test";
import { normalizeId } from "../src/commands/detail";
import { parseDetail, requirementSignals } from "../src/parse-detail";
import { err, fixture, html, runCLI, runWithServer } from "./helpers";

const DETAIL_PATH = "/deutschland/studienangebote/international-programmes/en/detail/5252/";

describe("parseDetail", () => {
  test("parseDetail reads the Digital Health fixture", async () => {
    const d = parseDetail(await fixture("detail-5252.html"), "5252")!;
    expect(d.title).toBe("Digital Health");
    expect(d.company).toBe("University of Potsdam");
    expect(d.location).toBe("Potsdam");
    expect(d.country).toBe("Germany");
    expect(d.url).toBe(`https://www2.daad.de${DETAIL_PATH}`);
    expect(d.degree).toBe("Master of Science");
    expect(d.cooperation).toContain("Hasso Plattner Institute");
    expect(d.beginning).toBe("Winter semester");
    expect(d.applicationPeriods).toContain("1 April - 1 June");
    expect(d.tuitionFees).toBe("None");
    expect(d.semesterContribution).toContain("322 EUR");
    expect(d.costsOfLiving).toContain("941 EUR");
    expect(d.admissionRequirements).toContain("Computer Science or a related subject");
    const s = d.requirementSignals;
    expect(s.bachelorSubject).toBe("Computer Science or a related subject");
    expect(s.englishLevel).toBe("C1");
    expect(s.englishCertificate).toBe(true);
    expect(s.ielts).toBe("7");
    expect(s.toefl).toBe("95");
    expect(s.germanRequired).toBe(false);
    expect(s.combinedPhd).toBe(false);
  });

  test("requirementSignals: German level and uni-assist", async () => {
    const d = parseDetail(await fixture("detail-5252.html"), "5252")!;
    const { requirementSignals: _, ...rest } = d;
    const s = requirementSignals({ ...rest, germanSkills: "German B2 required", submitVia: "Apply via uni-assist" });
    expect(s.germanRequired).toBe("B2");
    expect(s.uniAssist).toBe(true);
  });

  test("a page without <dt>/<dd> pairs gives null", () => {
    expect(parseDetail("<html><title>Something</title><body>changed</body></html>", "5252")).toBeNull();
  });
});

describe("detail command", () => {
  test("detail CLI: 404 → NOT_FOUND; 200 without pairs → PARSE_FAILED; both with empty stdout", async () => {
    const missing = await runWithServer(["detail", "5252"], () => html("gone", 404));
    expect(missing.result.exitCode).toBe(1);
    expect(missing.result.stdout).toBe("");
    expect(err(missing.result.stderr).code).toBe("NOT_FOUND");
    const changed = await runWithServer(["detail", "5252"], () => html("<html><body>changed</body></html>"));
    expect(changed.result.exitCode).toBe(1);
    expect(changed.result.stdout).toBe("");
    expect(err(changed.result.stderr).code).toBe("PARSE_FAILED");
  });

  test("detail CLI requests /en/detail/<id>/ and plain output shows the requirement warnings", async () => {
    const page = await fixture("detail-5252.html");
    const { result, requests } = await runWithServer(["detail", "5252", "--format", "plain"], () => html(page));
    expect(result.exitCode).toBe(0);
    expect(requests[0].url.pathname).toBe(DETAIL_PATH);
    expect(result.stdout).toContain("C1");
    expect(result.stdout).toContain("Computer Science or a related subject");
  });

  test("normalizeId", () => {
    const base = "https://www2.daad.de/deutschland/studienangebote/international-programmes";
    expect(normalizeId("5252")).toBe("5252");
    expect(normalizeId(`${base}/en/detail/5252/`)).toBe("5252");
    expect(normalizeId(`${base}/de/detail/5252/`)).toBe("5252");
    expect(normalizeId("https://www2.daad.de.evil.io/deutschland/studienangebote/international-programmes/en/detail/5252/")).toBeNull();
    expect(normalizeId("abc")).toBeNull();
  });

  test("detail with a bad id exits 1 with BAD_ID", async () => {
    const r = await runCLI(["detail", "https://evil.io/en/detail/5252/"]);
    expect(r.exitCode).toBe(1);
    expect(err(r.stderr).code).toBe("BAD_ID");
  });
});
