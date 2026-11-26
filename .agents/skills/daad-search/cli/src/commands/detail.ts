import { BASE, fetchText, stripInvisible, writeError } from "../helpers.js"
import { parseDetail } from "../parse-detail.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

const HOST = /^www2\.daad\.de$/i
const PATH = /^\/deutschland\/studienangebote\/international-programmes\/(?:en|de)\/detail\/(\d{1,7})\/?$/

/** Accept a numeric programme id or its www2.daad.de detail URL; reject other hosts via real URL parsing. */
export function normalizeId(input: string): string | null {
  const trimmed = input.trim()
  if (/^\d{1,7}$/.test(trimmed)) return trimmed

  const hasScheme = /^https?:\/\//i.test(trimmed)
  if (hasScheme || /^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(trimmed)) {
    let parsed: URL
    try {
      parsed = new URL(hasScheme ? trimmed : `https://${trimmed}`)
    } catch {
      return null
    }
    if (!HOST.test(parsed.hostname)) return null
    return parsed.pathname.match(PATH)?.[1] ?? null
  }
  return null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeId(opts.id)
  if (!id) {
    writeError(`Could not parse a DAAD programme id from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    const html = await fetchText(`${BASE}/deutschland/studienangebote/international-programmes/en/detail/${id}/`, "text/html")
    if (html === null) {
      writeError(`Programme ${id} not found - it may have been removed from the database`, "NOT_FOUND")
      return 1
    }
    const parsed = parseDetail(html, id)
    if (!parsed) {
      writeError(`Programme ${id} page has no programme details - DAAD's layout may have changed`, "PARSE_FAILED")
      return 1
    }
    const d = stripInvisible(parsed)
    if (opts.format === "plain") {
      const s = d.requirementSignals
      const english = [
        s.englishLevel ? `level ${s.englishLevel}` : "",
        s.englishCertificate ? "certificate required" : "",
        s.ielts ? `IELTS ${s.ielts}` : "",
        s.toefl ? `TOEFL iBT ${s.toefl}` : "",
      ].filter(Boolean)
      const german = s.germanRequired === false ? "not required" : s.germanRequired ? `level ${s.germanRequired}` : "unclear - check the text"
      const lines = [
        d.title,
        `${d.company || "—"} · ${d.location || "—"}`,
        "",
        d.degree ? `Degree: ${d.degree}` : "",
        d.teachingLanguage ? `Teaching language: ${d.teachingLanguage}` : "",
        d.duration ? `Duration: ${d.duration}` : "",
        d.beginning ? `Beginning: ${d.beginning}` : "",
        s.combinedPhd !== null ? `Combined master's/PhD: ${s.combinedPhd ? "yes" : "no"}` : "",
        "",
        "REQUIREMENTS TO CHECK (hints, not an admission decision)",
        `  Bachelor's subject: ${s.bachelorSubject ?? "not stated in a standard form - read the admission text"}`,
        `  English: ${english.length ? english.join(", ") : "not stated"}`,
        `  German: ${german}`,
        s.uniAssist ? "  Application via uni-assist" : "",
        "",
        d.applicationPeriods ? `Application periods: ${d.applicationPeriods}` : "",
        d.tuitionFees ? `Tuition fees per semester: ${d.tuitionFees}` : "",
        d.semesterContribution ? `Semester contribution: ${d.semesterContribution}` : "",
        d.costsOfLiving ? `Costs of living: ${d.costsOfLiving}` : "",
        "",
        d.admissionRequirements ? `ADMISSION REQUIREMENTS\n${d.admissionRequirements}` : "",
        d.submitVia ? `How to apply: ${d.submitVia}` : "",
        `URL: ${d.url}`,
      ]
      // Drop empty lines, but keep single blank separators between blocks.
      const text = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()
      process.stdout.write(text + "\n")
    } else {
      process.stdout.write(JSON.stringify(d, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
    return 1
  }
}
