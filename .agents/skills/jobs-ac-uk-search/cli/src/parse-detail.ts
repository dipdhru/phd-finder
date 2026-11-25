// Advert page: a schema.org JobPosting JSON-LD block (title, organisation,
// place, dates, full advert HTML), the details table (`j-advert-details__*`),
// and labelled paragraphs inside the advert. Anchors verified 2026-11-21.

import { BASE, clean, cleanMultiline } from "./helpers.js"
import type { JobCard } from "./parse-search.js"

export interface FundingSignals {
  funded: string[]
  unfunded: string[]
  eligibility: string[]
}

export interface JobDetail extends Omit<JobCard, "salary" | "department" | "country"> {
  country: string | null
  qualification: string | null
  fundingFor: string[]
  fundingAmount: string | null
  hours: string | null
  reference: string | null
  startDate: string | null
  duration: string | null
  sponsor: string | null
  supervisors: string[]
  eligibility: string | null
  applyUrl: string | null
  description: string | null
  fundingSignals: FundingSignals
}

// FUNDED, UNFUNDED and ELIGIBILITY start as euraxess-search's rules, then add
// the UK studentship phrases.
const FUNDED: [RegExp, string][] = [
  [/\bfully[- ]funded\b/i, "fully funded"],
  [/\bstipends?\b/i, "stipend"],
  [/\bstudentships?\b/i, "studentship"],
  [/\bscholarships?\b/i, "scholarship"],
  [/\bfunded (full-time |part-time )?(doctoral|PhD|Ph\.D\.) (position|project|candidate)s?\b/i, "funded position"],
  [/\bsalary\b|\bremuneration\b/i, "salary"],
  [/\bemployment contract\b/i, "employment contract"],
  [/\bTV-?L\b|\bTVöD\b/i, "German public pay scale (TV-L/TVöD)"],
  [/\bE\s?13\b/, "E13 pay grade"],
  [/\bliving allowance\b/i, "living allowance"],
  [/\bmobility allowance\b/i, "mobility allowance"],
  [/\btuition fees? (are )?(waived|covered|paid)\b|\bfee waiver\b/i, "tuition covered"],
  [/\bMarie Sk[lł]odowska-Curie\b|\bMSCA\b/i, "MSCA"],
  [/\bUKRI\b[^.]{0,40}\brate\b/i, "UKRI rate"],
  [/\btax[- ]free\b[^.]{0,30}\b(stipend|allowance|maintenance)\b/i, "tax-free stipend"],
]
const UNFUNDED: [RegExp, string][] = [
  [/\bself[- ]funded\b/i, "self-funded"],
  [/\b(own|external) funding\b/i, "own funding required"],
  [/\bunfunded\b|\bno funding\b/i, "no funding"],
  [/\btuition fees? (apply|are charged|must be paid)\b/i, "tuition fees apply"],
]
const ELIGIBILITY: [RegExp, string][] = [
  [/must not have resided|mobility rule/i, "MSCA mobility rule"],
  [/\bhome (students?|fee status)\b/i, "home-fee status"],
  [/\b(EU|UK|EEA) (nationals?|citizens?)\b/i, "nationality restriction"],
  [/\bany nationality\b/i, "any nationality"],
  [/\bwithout a (PhD|doctorate)\b|\bnot (yet )?(been awarded|hold) a (PhD|doctoral)/i, "must not hold a PhD"],
  // Fees paid at the home rate leave an international student owing the difference
  // (unless the advert covers it: see FEE_DIFFERENCE_COVERED).
  [/\bUK Home only\b|\bhome[- ](tuition )?(fees?|rate)\b|\bfees at the (UK )?home rate\b|\b(fees|tuition) at the UK rate\b/i, "home fees only"],
  [/\bUK (Home )?students only\b/i, "UK students only"],
  [/\binternational (students|applicants)\b[^.]{0,30}\b(not|ineligible|unable)\b/i, "international students not eligible"],
  [/\binternational (students|applicants)\b[^.]{0,30}\b(eligible|welcome|may apply|can apply)\b/i, "international students eligible"],
]

/**
 * The international fee, or the home/international difference, is covered or
 * waived. Kept narrow on purpose: "international students welcome; fees paid at
 * the home rate" must still read as home fees only.
 */
const FEE_DIFFERENCE_COVERED =
  /\binternational (tuition )?fees?\b[^.]{0,40}\b(waived|covered|paid)\b|\b(waive[sd]?|cover(s|ed)?|pa(y|id))\b[^.]{0,40}\bdifference\b|\bdifference\b[^.]{0,40}\b(waived|covered|paid)\b/i

/** Phrases that hint at funding and eligibility. Hints for ranking, not a verdict. */
export function fundingSignals(text: string): FundingSignals {
  const hits = (rules: [RegExp, string][]) => rules.filter(([re]) => re.test(text)).map(([, label]) => label)
  let eligibility = hits(ELIGIBILITY)
  // "International students are not eligible" also matches the positive rule.
  if (eligibility.includes("international students not eligible")) {
    eligibility = eligibility.filter((l) => l !== "international students eligible")
  }
  if (FEE_DIFFERENCE_COVERED.test(text)) eligibility = eligibility.filter((l) => l !== "home fees only")
  return { funded: hits(FUNDED), unfunded: hits(UNFUNDED), eligibility }
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]

/** "19th November 2026", "1 st October 2027" (a split <sup>), "27 Jan 2027" → ISO date. */
export function parseUkDate(text: string | null): string | null {
  const m = text?.trim().match(/^(\d{1,2})\s*(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})$/i)
  if (!m) return null
  const day = Number(m[1])
  const month = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase())
  const year = Number(m[3])
  if (month < 0) return null
  const d = new Date(Date.UTC(year, month, day))
  if (d.getUTCMonth() !== month || d.getUTCDate() !== day) return null
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

type JsonObject = Record<string, unknown>
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)

/** The first JSON-LD block whose @type is JobPosting; broken and other blocks are skipped. */
function jobPosting(html: string): JsonObject | null {
  for (const [, body] of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data: unknown = JSON.parse(body)
      for (const item of Array.isArray(data) ? data : [data]) {
        if (item && typeof item === "object" && (item as JsonObject)["@type"] === "JobPosting") return item as JsonObject
      }
    } catch {
      // Not valid JSON: try the next block.
    }
  }
  return null
}

/** clean(), then tidy the spaces tag-stripping leaves inside brackets: "( a@b )" → "(a@b)". */
const tidy = (html: string) => clean(html).replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").replace(/\s+([.,;:])/g, "$1")

/** Label → cell text of the details table. */
function detailsTable(html: string): Map<string, string> {
  const rows = new Map<string, string>()
  for (const [, th, td] of html.matchAll(/<th class="j-advert-details__table-header">([\s\S]*?)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/g)) {
    const label = clean(th).replace(/:$/, "").toLowerCase()
    if (!rows.has(label)) rows.set(label, clean(td))
  }
  return rows
}

/** Value of a `<strong>Label:</strong> value</p>` paragraph in the advert HTML. */
function labelled(advert: string, label: string): string | null {
  const m = advert.match(new RegExp(`<strong>\\s*${label}\\s*:?[\\s\\u00a0]*</strong>([\\s\\S]*?)</p>`, "i"))
  const text = m ? tidy(m[1]) : ""
  return text || null
}

/**
 * Paragraphs under a heading, up to the next heading. A heading is a <p> that
 * is nothing but one <strong> of at most 40 characters, not ending in "." -
 * a bold sentence such as "Available to UK Home students only." is content.
 */
function underHeading(advert: string, heading: RegExp): string[] {
  const paras = [...advert.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map(([, inner]) => inner)
  const headingText = (inner: string) => {
    const m = inner.match(/^\s*<strong>([\s\S]*?)<\/strong>\s*$/i)
    const text = m ? clean(m[1]) : ""
    return text && text.length <= 40 && !text.endsWith(".") ? text.replace(/:$/, "") : null
  }
  const start = paras.findIndex((p) => {
    const h = headingText(p)
    return h !== null && heading.test(h)
  })
  if (start < 0) return []
  const out: string[] = []
  for (const p of paras.slice(start + 1)) {
    if (headingText(p) !== null) break
    const text = tidy(p)
    if (text) out.push(text)
  }
  return out
}

export function parseDetail(html: string, id: string): JobDetail | null {
  const job = jobPosting(html)
  const title = job ? clean(str(job.title) ?? "") : ""
  if (!job || !title) return null

  const org = job.hiringOrganization as JsonObject | undefined
  const places = Array.isArray(job.jobLocation) ? job.jobLocation : job.jobLocation ? [job.jobLocation] : []
  const address = ((places[0] as JsonObject | undefined)?.address ?? {}) as JsonObject
  const advert = str(job.description) ?? ""
  const table = detailsTable(html)
  const row = (label: string) => table.get(label) || null

  const description = cleanMultiline(advert) || null
  const fundingFor = (row("funding for") ?? "").split(",").map((s) => s.trim()).filter(Boolean)
  const fundingAmount = row("funding amount")
  const apply = html.match(/<a href="([^"]+)"[^>]*>\s*<div id="job-apply-button"/)?.[1] ?? null
  const eligibility = underHeading(advert, /^eligibility( criteria)?$/i)

  return {
    id,
    title,
    company: str(org?.name),
    location: [str(address.addressLocality), str(address.addressRegion)].filter(Boolean).join(", ") || row("location"),
    country: str(address.addressCountry),
    date: str(job.datePosted)?.slice(0, 10) ?? parseUkDate(row("placed on")),
    deadline: str(job.validThrough)?.slice(0, 10) ?? parseUkDate(row("closes")),
    url: `${BASE}/job/${id}`,
    qualification: row("qualification type"),
    fundingFor,
    fundingAmount,
    hours: row("hours"),
    reference: row("reference"),
    startDate: parseUkDate(labelled(advert, "Start date")),
    duration: labelled(advert, "(?:Award )?duration"),
    sponsor: labelled(advert, "Sponsors?"),
    supervisors: underHeading(advert, /^supervisors?$/i),
    eligibility: eligibility.length ? eligibility.join("\n") : null,
    // The employer's own application page: third-party, so only plain http(s) URLs pass.
    applyUrl: apply && /^https?:\/\/[^\s"'<>]+$/i.test(apply) ? apply : null,
    description,
    fundingSignals: fundingSignals([title, description, fundingFor.join(", "), fundingAmount].filter(Boolean).join("\n")),
  }
}
