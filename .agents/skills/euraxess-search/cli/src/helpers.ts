// Data source: EURAXESS (euraxess.ec.europa.eu), the European Commission's
// portal for research jobs. It has no public API, so this CLI reads the
// server-rendered HTML search and detail pages. robots.txt allows /jobs
// (filtered search URLs included: `Allow: /jobs` is the longest match over
// `Disallow: /*?`). Keep scans small - one page is 10 offers.

export const BASE = "https://euraxess.ec.europa.eu"
export const SEARCH_URL = `${BASE}/jobs/search`

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA = "Mozilla/5.0 (compatible; euraxess-cli/1.0)"

/** Fetch HTML with exponential backoff on 429/5xx. Returns null on a 404. */
export async function htmlFetch(url: string): Promise<string | null> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    })
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`)
      }
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (response.status === 404) return null
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    return response.text()
  }
  throw new Error("Request failed after max retries")
}

// --- Output hygiene: copied unchanged from arbeitnow-search/cli/src/helpers.ts ---

/**
 * Convert a Unicode code point to a string. Uses `fromCodePoint` (not
 * `fromCharCode`) so supplementary-plane code points (e.g. emoji, U+1F600)
 * decode correctly, and drops out-of-range values instead of throwing.
 */
function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    // Numeric character references: decimal (&#233;) and hexadecimal (&#xE9;).
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&nbsp;/g, " ")
}

/**
 * Characters a reader of the posting never sees but a model reading this
 * output does: C0/C1 controls other than tab, newline and carriage return, the
 * soft hyphen, bidi marks/embeddings/overrides/isolates, zero-width characters
 * and invisible operators, the BOM, variation selectors, and Unicode tag
 * characters (U+E0000-E007F), which can spell out a whole hidden instruction.
 * Listing text is third-party data, and these arrive raw in a portal's JSON or
 * markup as easily as through a numeric entity.
 */
const INVISIBLE_CHARS =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F­؜᠎​-‏‪-‮⁠-⁯︀-️﻿\u{E0000}-\u{E007F}\u{E0100}-\u{E01EF}]/gu

/** Strip INVISIBLE_CHARS from every string in a result, recursively: the CLI's output boundary. */
export function stripInvisible<T>(value: T): T {
  if (typeof value === "string") return value.replace(INVISIBLE_CHARS, "") as T
  if (Array.isArray(value)) return value.map(stripInvisible) as T
  if (value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, stripInvisible(v)])) as T
  }
  return value
}

const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"])

/** Whether an opening tag's attributes keep it from rendering: `hidden`, or an inline style that hides it. */
function isHiddenTag(attrs: string): boolean {
  for (const m of attrs.matchAll(/([^\s"'=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) {
    const name = m[1].toLowerCase()
    const value = m[2] ?? m[3] ?? m[4] ?? ""
    if (name === "hidden") return true
    if (name === "style" && /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden|mso-hide\s*:\s*all)\b/i.test(value)) {
      return true
    }
  }
  return false
}

/**
 * Drop markup a browser never renders - comments (including Word's
 * conditional ones), <script>/<style>/<template> blocks, and elements marked
 * hidden - before tags are stripped. A plain tag strip keeps their text, which
 * hands the model words the posting's reader never saw. CSS-only tricks
 * (off-screen, zero font size) need a renderer and are not caught here.
 */
export function visibleHtml(html: string): string {
  const src = html
    .replace(/<!--[\s\S]*?(?:-->|$)/g, "")
    .replace(/<(script|style|template)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, "")
  // One pass, collecting what is kept: slicing the string per hidden element
  // would make a page full of them quadratic.
  const open = /<([a-zA-Z][a-zA-Z0-9-]*)(\s[^>]*)?>/g
  const kept: string[] = []
  let from = 0
  let m: RegExpExecArray | null
  while ((m = open.exec(src)) !== null) {
    if (!m[2] || !isHiddenTag(m[2])) continue
    const tag = m[1].toLowerCase()
    let end = open.lastIndex
    if (!VOID_TAGS.has(tag) && !m[0].endsWith("/>")) {
      // Skip to the matching close tag, counting nested same-name elements. An
      // unclosed hidden element runs to the end: failing closed drops visible
      // text, failing open would leak the hidden text.
      const same = new RegExp(`<(/?)${tag}\\b[^>]*>`, "gi")
      same.lastIndex = end
      end = src.length
      let depth = 1
      let s: RegExpExecArray | null
      while ((s = same.exec(src)) !== null) {
        if (s[1]) depth--
        else if (!s[0].endsWith("/>")) depth++
        if (depth === 0) {
          end = same.lastIndex
          break
        }
      }
    }
    kept.push(src.slice(from, m.index))
    from = end
    open.lastIndex = end
  }
  kept.push(src.slice(from))
  return kept.join("")
}

function stripTags(html: string): string {
  return visibleHtml(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

export function clean(html: string): string {
  return decodeHtmlEntities(stripTags(html))
}

/** Multi-line clean: hidden markup first, then each rendered line on its own. */
export function cleanMultiline(html: string): string {
  const withBreaks = visibleHtml(html)
    .replace(/\s+/g, " ")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h\d)>/gi, "\n")
  return withBreaks.split("\n").map(clean).join("\n").replace(/\n{3,}/g, "\n\n").trim()
}

// --- EURAXESS facets -------------------------------------------------------
// Values are the option ids of the search page's filter <select>s, verified
// live on 2026-11-12 (see url-reference.md). Several values of one facet are
// OR-ed by the site; different facets are AND-ed.

export const LEVELS: Record<string, string | null> = {
  phd: "php_positions", // sic: the site's own id
  master: "master_positions",
  postdoc: "postdoc_positions",
  bachelor: "bachelor_positions",
  undergraduate: "undergraduate_positions",
  "research-support": "research_support_positions",
  other: "other_positions",
  any: null,
}

export const PROFILES: Record<string, string> = { r1: "447", r2: "448", r3: "449", r4: "450" }

export const PROGRAMMES: Record<string, string> = {
  msca: "4348",
  cofund: "4349",
  erc: "4345",
  eic: "4346",
  horizon: "4344",
  none: "555",
}

export const COUNTRIES: Record<string, string> = {
  austria: "791", belgium: "792", croatia: "776", cyprus: "777", "czech republic": "747", czechia: "747",
  denmark: "757", estonia: "758", finland: "760", france: "793", germany: "794", deutschland: "794",
  greece: "779", hungary: "748", iceland: "762", ireland: "763", israel: "730", italy: "781",
  latvia: "766", lithuania: "767", luxembourg: "796", malta: "782", netherlands: "798", norway: "768",
  poland: "749", portugal: "784", romania: "751", slovakia: "753", slovenia: "787", spain: "788",
  sweden: "770", switzerland: "799", turkiye: "739", turkey: "739", "united kingdom": "771", uk: "771",
  australia: "802", brazil: "668", canada: "682", china: "694", europe: "742", "hong kong": "695",
  india: "705", japan: "698", kazakhstan: "688", korea: "700", morocco: "595", nigeria: "620",
  "saudi arabia": "736", singapore: "720", "united arab emirates": "740", uae: "740",
  "united states": "685", usa: "685", us: "685", uzbekistan: "692", vietnam: "723",
}

export const SORTS: Record<string, [string, string]> = {
  posted: ["created", "DESC"],
  deadline: ["field_job_application_deadline_z", "ASC"],
}

export interface SearchParams {
  query?: string
  level: string | null
  countries: string[]
  profiles: string[]
  programmes: string[]
  sort: keyof typeof SORTS
}

/** The search URL for one 0-indexed results page. */
export function searchUrl(p: SearchParams, pageIndex: number): string {
  const facets = ["offer_type:job_offer"]
  if (p.level) facets.push(`positions:${p.level}`)
  for (const c of p.countries) facets.push(`job_country:${c}`)
  for (const r of p.profiles) facets.push(`job_research_profile:${r}`)
  for (const g of p.programmes) facets.push(`job_is_eu_founded:${g}`)
  // Keywords are a facet too: the search box posts a form that redirects here.
  if (p.query) facets.push(`keywords:${p.query}`)
  const parts = facets.map((f, i) => `f%5B${i}%5D=${encodeURIComponent(f)}`)
  const [name, dir] = SORTS[p.sort]
  parts.push(`sort%5Bname%5D=${name}`, `sort%5Bdirection%5D=${dir}`)
  if (pageIndex > 0) parts.push(`page=${pageIndex}`)
  return `${SEARCH_URL}?${parts.join("&")}`
}

// --- Parsing ---------------------------------------------------------------

export interface JobCard {
  id: string
  title: string
  company: string | null
  location: string | null
  country: string | null
  date: string | null // posted, YYYY-MM-DD
  deadline: string | null // YYYY-MM-DD in the poster's own time zone
  url: string
  offers: number | null
  researchFields: string[]
  profiles: string[]
  fundingProgramme: string[]
  summary: string | null
}

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
}

/** "12 November 2026" or "26 Nov 2026 - 23:59 (Europe/Madrid)" -> "2026-11-12". */
export function parseDate(text: string | null): string | null {
  const m = text?.match(/(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{4})/)
  if (!m) return null
  const month = MONTHS[m[2].toLowerCase()]
  return month ? `${m[3]}-${month}-${m[1].padStart(2, "0")}` : null
}

/** The HTML of one labelled field on a result card, from its `id-<Label>` block up to the next one. */
function cardField(chunk: string, label: string): string | null {
  const start = chunk.indexOf(`class="id-${label} `)
  if (start < 0) return null
  // End at the `<div` that opens the next labelled block, not at its class attribute.
  const next = chunk.indexOf('class="id-', start + 10)
  const block = chunk.slice(start, next < 0 ? chunk.length : chunk.lastIndexOf("<", next))
  const body = block.indexOf('class="ecl-text-standard')
  if (body < 0) return null
  return block.slice(block.indexOf(">", body) + 1)
}

const anchors = (html: string | null): string[] =>
  html ? [...html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)].map((m) => clean(m[1])).filter(Boolean) : []

/** Each `<div>` row of a research-field block, e.g. "Chemistry » Biochemistry". */
const fieldRows = (html: string | null): string[] =>
  html
    ? cleanMultiline(html)
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)
    : []

/** Map one result card; null when it lacks an id or title. */
export function parseCard(chunk: string): JobCard | null {
  const head = chunk.match(/<h3 class="ecl-content-block__title">\s*<a\s+href="\/jobs\/(\d+)"[^>]*>([\s\S]*?)<\/a>/)
  if (!head) return null
  const id = head[1]
  const title = clean(head[2])
  if (!title) return null

  const meta = [...chunk.matchAll(/<li class="ecl-content-block__primary-meta-item">([\s\S]*?)<\/li>/g)].map((m) => clean(m[1]))
  const company = meta.find((m) => !m.startsWith("Posted on:")) || null
  const posted = meta.find((m) => m.startsWith("Posted on:")) ?? null

  const locRaw = cardField(chunk, "Work-Locations")
  const locLines = locRaw ? fieldRows(locRaw) : []
  let offers: number | null = null
  const locations = locLines.map((line) => {
    const m = line.match(/^Number of offers:\s*(\d+),\s*/)
    if (m) offers = (offers ?? 0) + Number(m[1])
    return m ? line.slice(m[0].length) : line
  })
  const country = locations[0]?.split(",")[0].trim() || null

  const deadlineHtml = cardField(chunk, "Application-Deadline")
  const desc = chunk.match(/<div class="ecl-content-block__description">([\s\S]*?)<\/div>/)

  return {
    id,
    title,
    company,
    location: locations.length ? locations.join("; ") : null,
    country,
    date: parseDate(posted),
    deadline: deadlineHtml ? parseDate(clean(deadlineHtml)) : null,
    url: `${BASE}/jobs/${id}`,
    offers,
    researchFields: fieldRows(cardField(chunk, "Research-Field")),
    profiles: anchors(cardField(chunk, "Researcher-Profile")),
    fundingProgramme: anchors(cardField(chunk, "Funding-Programme")),
    summary: desc ? clean(desc[1]) || null : null,
  }
}

export function parseSearchPage(html: string): { cards: JobCard[]; total: number | null } {
  const total = html.match(/Search results\s*<span>\s*\((\d+)\)/)
  const chunks = html.split('<article class="ecl-content-item"').slice(1)
  const cards: JobCard[] = []
  // Parse each card on its own so one malformed card cannot break the rest.
  for (const chunk of chunks) {
    try {
      const end = chunk.indexOf("</article>")
      const card = parseCard(end < 0 ? chunk : chunk.slice(0, end))
      if (card) cards.push(card)
    } catch {
      continue
    }
  }
  return { cards, total: total ? Number(total[1]) : null }
}

/** Lower-case and fold German umlauts and other diacritics. */
export function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
}

const PLACE_ALIASES: Record<string, string[]> = {
  muenchen: ["munich"], munich: ["muenchen"],
  koeln: ["cologne"], cologne: ["koeln"],
  nuernberg: ["nuremberg"], nuremberg: ["nuernberg"],
}

export function locationMatches(location: string | null, wanted: string): boolean {
  const have = fold(location ?? "")
  const w = fold(wanted.trim())
  return [w, ...(PLACE_ALIASES[w] ?? [])].some((alt) => have.includes(alt))
}

// --- Detail ----------------------------------------------------------------

export interface FundingSignals {
  funded: string[]
  unfunded: string[]
  eligibility: string[]
}

export interface JobDetail extends Omit<JobCard, "summary" | "offers"> {
  department: string | null
  positions: string[]
  contractType: string | null
  jobStatus: string | null
  hoursPerWeek: string | null
  startDate: string | null
  mscaGrant: string | null
  applyUrl: string | null
  description: string | null
  requirements: string | null
  additionalInformation: string | null
  fundingSignals: FundingSignals
}

/** The HTML between `<h2 id="<id>">` and the next h2. */
function section(html: string, id: string): string {
  const start = html.indexOf(`<h2 id="${id}"`)
  if (start < 0) return ""
  const body = html.indexOf("</h2>", start) + 5
  const next = html.indexOf("<h2 ", body)
  return html.slice(body, next < 0 ? html.length : next)
}

/** dt/dd pairs of a description list; each value split into its rendered rows. */
function definitions(html: string): [string, string[]][] {
  return [...html.matchAll(/<dt class="ecl-description-list__term">([\s\S]*?)<\/dt>\s*<dd class="ecl-description-list__definition">([\s\S]*?)<\/dd>/g)]
    .map(([, dt, dd]) => [clean(dt), fieldRows(dd)] as [string, string[]])
}

/** Section text with each dt/dd pair on its own "Term: value" line. */
function sectionText(html: string): string | null {
  const text = cleanMultiline(
    html.replace(/<\/dt>\s*<dd[^>]*>/g, ": ").replace(/<\/dd>/g, "</div>"),
  )
  return text || null
}

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
]

/** Phrases that hint at funding and eligibility. Hints for ranking, not a verdict. */
export function fundingSignals(text: string): FundingSignals {
  const hits = (rules: [RegExp, string][]) => rules.filter(([re]) => re.test(text)).map(([, label]) => label)
  return { funded: hits(FUNDED), unfunded: hits(UNFUNDED), eligibility: hits(ELIGIBILITY) }
}

export function parseDetail(html: string, id: string): JobDetail | null {
  const og = html.match(/<meta property="og:title" content="([^"]*)"/)
  const title = og ? clean(og[1]) : ""
  const infoHtml = section(html, "job-information")
  if (!title || !infoHtml) return null

  const info = new Map<string, string[]>()
  for (const [k, v] of definitions(infoHtml)) if (!info.has(k)) info.set(k, v)
  const one = (k: string) => info.get(k)?.join(", ") || null
  const programme = [...info.entries()].find(([k]) => k.startsWith("Is the job funded through the EU"))?.[1] ?? []
  const website = definitions(section(html, "where-to-apply")).find(([k]) => k === "Website")?.[1].join("") ?? null

  // Work locations: one block per location, each starting at "Number of offers available".
  const locHtml = section(html, "work-locations")
  const locations = locHtml
    .split("Number of offers available")
    .slice(1)
    .map((block) => {
      const d = new Map(definitions(`<dt class="ecl-description-list__term">x</dt><dd class="ecl-description-list__definition">${block}`))
      const institute = d.get("Company/Institute")?.join(" ")
      const company = info.get("Organisation/Company")?.join(", ")
      const parts = [institute !== company ? institute : undefined, d.get("City")?.join(" "), d.get("Country")?.join(" ")]
      return parts.filter(Boolean).join(", ")
    })
    .filter(Boolean)

  const description = sectionText(section(html, "offer-description"))
  const requirements = sectionText(section(html, "requirements"))
  const additionalInformation = sectionText(section(html, "additional-information"))
  const allText = [title, description, requirements, additionalInformation, programme.join(" ")].join("\n")

  const country = one("Country")
  return {
    id,
    title,
    company: one("Organisation/Company"),
    location: locations.length ? locations.join("; ") : country,
    country,
    date: parseDate(html.match(/ecl-content-item__meta[\s\S]*?<div class="ecl-u-mt-xs ">\s*([^<]+)/)?.[1] ?? null),
    deadline: parseDate(one("Application Deadline")),
    url: `${BASE}/jobs/${id}`,
    researchFields: info.get("Research Field") ?? [],
    profiles: info.get("Researcher Profile") ?? [],
    fundingProgramme: programme,
    department: one("Department"),
    positions: info.get("Positions") ?? [],
    contractType: one("Type of Contract"),
    jobStatus: one("Job Status"),
    hoursPerWeek: one("Hours Per Week"),
    startDate: parseDate(one("Offer Starting Date")),
    mscaGrant: one("Marie Curie Grant Agreement Number"),
    // The employer's own application page: third-party, so only plain http(s) URLs pass.
    applyUrl: website && /^https?:\/\/[^\s"'<>]+$/i.test(website) ? website : null,
    description,
    requirements,
    additionalInformation,
    fundingSignals: fundingSignals(allText),
  }
}
