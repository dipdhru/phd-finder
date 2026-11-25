import { BASE, htmlFetch, stripInvisible, writeError } from "../helpers.js"
import { parseDetail } from "../parse-detail.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

const ID = /^[A-Z]{2,4}\d{2,5}$/i
const HOST = /^(www\.)?jobs\.ac\.uk$/i

/** Accept an advert id (DTS352) or a jobs.ac.uk/job/<id>[/slug] URL; reject other hosts via real URL parsing. */
export function normalizeId(input: string): string | null {
  const trimmed = input.trim()
  if (ID.test(trimmed)) return trimmed.toUpperCase()

  const hasScheme = /^https?:\/\//i.test(trimmed)
  if (hasScheme || /^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(trimmed)) {
    let parsed: URL
    try {
      parsed = new URL(hasScheme ? trimmed : `https://${trimmed}`)
    } catch {
      return null
    }
    if (!HOST.test(parsed.hostname)) return null
    const m = parsed.pathname.match(/^\/job\/([A-Za-z0-9]+)(?:\/[^/]*)?\/?$/)
    return m && ID.test(m[1]) ? m[1].toUpperCase() : null
  }
  return null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeId(opts.id)
  if (!id) {
    writeError(`Could not parse a jobs.ac.uk advert id from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    const html = await htmlFetch(`${BASE}/job/${id}`)
    if (html === null) {
      writeError(`Advert ${id} not found - it may have been withdrawn`, "NOT_FOUND")
      return 1
    }
    const job = parseDetail(html, id)
    if (!job) {
      writeError(`Advert ${id} page has no JobPosting data - jobs.ac.uk markup may have changed`, "PARSE_FAILED")
      return 1
    }
    const c = stripInvisible(job)
    if (opts.format === "plain") {
      const s = c.fundingSignals
      const homeFees = s.eligibility.includes("home fees only")
      const lines = [
        c.title,
        `${c.company || "—"} · ${c.location || "—"}`,
        "",
        c.qualification ? `Qualification: ${c.qualification}` : "",
        c.fundingFor.length ? `Funding for: ${c.fundingFor.join(", ")}` : "",
        c.fundingAmount ? `Funding amount: ${c.fundingAmount}` : "",
        `Funding hints: ${s.funded.join(", ") || "none"}${s.unfunded.length ? ` | warnings: ${s.unfunded.join(", ")}` : ""}`,
        s.eligibility.length ? `Eligibility hints: ${s.eligibility.join(", ")}` : "",
        homeFees ? "WARNING: home fees only - an international student may owe the international fee difference." : "",
        c.date ? `Posted: ${c.date}` : "",
        c.deadline ? `Closes: ${c.deadline}` : "",
        c.startDate ? `Starts: ${c.startDate}` : "",
        c.duration ? `Duration: ${c.duration}` : "",
        c.sponsor ? `Sponsor: ${c.sponsor}` : "",
        c.supervisors.length ? `Supervisors: ${c.supervisors.join("; ")}` : "",
        "",
        c.description || "(no description)",
        c.eligibility ? `\nELIGIBILITY\n${c.eligibility}` : "",
        "",
        c.applyUrl ? `Apply (employer site): ${c.applyUrl}` : "",
        `URL: ${c.url}`,
      ].filter((l) => l !== "")
      process.stdout.write(lines.join("\n") + "\n")
    } else {
      process.stdout.write(JSON.stringify(c, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
    return 1
  }
}
