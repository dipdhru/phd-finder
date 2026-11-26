// DAAD search API response: { courses: [...], numResults, filter }. Each
// course is mapped to the shared record shape (field names as in the other
// skills where they mean the same thing). Verified live on 2026-11-26.

import { BASE, clean, cleanMultiline } from "./helpers.js"

export type DeadlineStatus = "open" | "past" | "unknown"

export interface Programme {
  id: string
  title: string
  company: string | null
  location: string | null
  country: "Germany"
  url: string
  languages: string[]
  beginning: string | null
  duration: string | null
  tuitionFees: string | null
  subject: string | null
  deadline: string | null
  deadlineText: string | null
  deadlineStatus: DeadlineStatus
}

/** A response that is not the search JSON: an error page, or a changed API. */
export class ParseError extends Error {}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"]
const DATE = new RegExp(`\\b(\\d{1,2})\\s+(${MONTHS.join("|")})\\s+(\\d{4})\\b`, "gi")

const isoDay = (d: Date) => d.toISOString().slice(0, 10)

/**
 * The first "D Month YYYY" date in DAAD's deadline text, and whether it is
 * still open. "+ N more" means further dates DAAD doesn't show in the list, so
 * the programme may still be open even when the first date has passed.
 */
export function parseDeadline(text: string | null, today: Date): { deadline: string | null; status: DeadlineStatus } {
  if (!text) return { deadline: null, status: "unknown" }
  const dates: string[] = []
  for (const [, d, m, y] of text.matchAll(DATE)) {
    const month = MONTHS.indexOf(m.toLowerCase())
    const day = Number(d)
    const check = new Date(Date.UTC(Number(y), month, day))
    if (check.getUTCMonth() !== month || check.getUTCDate() !== day) continue
    dates.push(isoDay(check))
  }
  if (dates.length === 0) return { deadline: null, status: "unknown" }
  const now = isoDay(today)
  const more = /\+\s*\d+\s+more\b/i.test(text)
  return { deadline: dates[0], status: more || dates.some((d) => d >= now) ? "open" : "past" }
}

export function isFree(tuitionFees: string | null): boolean {
  return tuitionFees !== null && tuitionFees.trim().replace(/\s+/g, " ").toLowerCase() === "no tuition fees"
}

const text = (v: unknown) => (typeof v === "string" ? clean(v) || null : null)

export function mapCourse(course: Record<string, unknown>, today: Date): Programme | null {
  const id = typeof course.id === "number" || typeof course.id === "string" ? String(course.id) : ""
  const title = text(course.courseName)
  if (!/^\d+$/.test(id) || !title) return null
  const link = typeof course.link === "string" && course.link.startsWith("/") ? course.link : `/deutschland/studienangebote/international-programmes/en/detail/${id}/`
  const deadlineText = typeof course.applicationDeadline === "string" ? cleanMultiline(course.applicationDeadline) || null : null
  const { deadline, status } = parseDeadline(deadlineText, today)
  return {
    id,
    title,
    company: text(course.academy),
    location: text(course.city),
    country: "Germany",
    url: BASE + link,
    languages: Array.isArray(course.languages) ? course.languages.map(text).filter((l): l is string => l !== null) : [],
    beginning: text(course.beginning),
    duration: text(course.programmeDuration),
    tuitionFees: text(course.tuitionFees),
    subject: text(course.subject),
    deadline,
    deadlineText,
    deadlineStatus: status,
  }
}

export function parseSearchResponse(body: string, today: Date): { programmes: Programme[]; total: number } {
  let data: unknown
  try {
    data = JSON.parse(body)
  } catch {
    throw new ParseError("DAAD search did not return JSON - the API may have changed or the site may be down")
  }
  const courses = (data as { courses?: unknown })?.courses
  if (!Array.isArray(courses)) throw new ParseError("DAAD search response has no courses list - the API may have changed")
  const programmes = courses
    .map((c) => (c && typeof c === "object" ? mapCourse(c as Record<string, unknown>, today) : null))
    .filter((p): p is Programme => p !== null)
  const n = (data as { numResults?: unknown }).numResults
  return { programmes, total: typeof n === "number" ? n : programmes.length }
}
