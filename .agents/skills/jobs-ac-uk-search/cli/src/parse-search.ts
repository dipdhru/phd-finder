// Search results page: 25 adverts per page, each a `j-search-result__result`
// block. Anchors verified on the live page 2026-11-21 (see url-reference.md).

import { BASE, clean } from "./helpers.js"

export interface JobCard {
  id: string
  title: string
  company: string | null
  department: string | null
  location: string | null
  /** Cards show a city only; `detail` gives the country. */
  country: null
  date: string | null
  deadline: string | null
  url: string
  salary: string | null
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]

const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`

/**
 * A card's "20 Nov" as an ISO date. Cards carry no year, so pick the year that
 * puts the date on the right side of `ref`: on or before it for a placed date
 * ("past"), on or after it for a closing date ("future").
 */
export function inferDate(dayMonth: string, ref: Date, direction: "past" | "future"): string | null {
  const m = dayMonth.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*$/)
  if (!m) return null
  const day = Number(m[1])
  const month = MONTHS.indexOf(m[2].toLowerCase())
  if (month < 0) return null
  const refIso = iso(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate())
  let year = ref.getUTCFullYear()
  const at = (y: number) => iso(y, month, day)
  if (direction === "past" && at(year) > refIso) year--
  if (direction === "future" && at(year) < refIso) year++
  // Date.UTC rolls 31 Feb over into March: such a day doesn't exist.
  const check = new Date(Date.UTC(year, month, day))
  return check.getUTCMonth() === month && check.getUTCDate() === day ? at(year) : null
}

/** Inner text of the first element carrying `cls`, or null when missing or blank. */
function byClass(html: string, cls: string): string | null {
  const m = html.match(new RegExp(`class="${cls}[^"]*"[^>]*>([\\s\\S]*?)</(?:div|span)>`))
  const text = m ? clean(m[1]) : ""
  return text || null
}

/** Text after a "<label>" marker up to the closing </div>. */
function after(html: string, marker: RegExp): string | null {
  const m = html.match(new RegExp(marker.source + "([\\s\\S]*?)</div>"))
  const text = m ? clean(m[1]) : ""
  return text || null
}

export function parseCard(chunk: string, today: Date): JobCard | null {
  const link = chunk.match(/<a[^>]*href="\/job\/([A-Za-z0-9]+)\/[^"]*"[^>]*>([\s\S]*?)<\/a>/)
  if (!link) return null
  const id = link[1].toUpperCase()
  const salary = after(chunk, /<strong>Salary:\s*<\/strong>/)
  const placed = chunk.match(/Date Placed:\s*<\/strong>\s*([^<]+)/)?.[1]
  const closes = chunk.match(/class="[^"]*j-search-result__date--blue[^"]*"[^>]*>([^<]*)</)?.[1]
  const date = placed ? inferDate(placed, today, "past") : null
  return {
    id,
    title: clean(link[2]),
    company: byClass(chunk, "j-search-result__employer"),
    department: byClass(chunk, "j-search-result__department"),
    location: after(chunk, /<div>\s*Location:/),
    country: null,
    date,
    deadline: closes ? inferDate(closes, date ? new Date(`${date}T00:00:00Z`) : today, "future") : null,
    url: `${BASE}/job/${id}`,
    salary: salary && !/^not specified$/i.test(salary) ? salary : null,
  }
}

export function parseSearchPage(html: string, today: Date): { cards: JobCard[]; total: number | null } {
  const count = html.match(/<strong class="job-count">\s*([\d,]+)\s*<\/strong>/)
  const total = count ? Number(count[1].replace(/,/g, "")) : null
  const cards = html
    .split('class="j-search-result__result')
    .slice(1)
    .map((chunk) => parseCard(chunk, today))
    .filter((c): c is JobCard => c !== null)
  return { cards, total }
}
