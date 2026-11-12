import { BASE, htmlFetch, parseDetail, stripInvisible, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

const EURAXESS_HOST = /^euraxess\.ec\.europa\.eu$/i

/** Accept a numeric offer id or a euraxess.ec.europa.eu/jobs/<id> URL; reject other hosts via real URL parsing. */
export function normalizeId(input: string): string | null {
  const trimmed = input.trim()
  if (/^\d{1,9}$/.test(trimmed)) return trimmed

  const hasScheme = /^https?:\/\//i.test(trimmed)
  if (hasScheme || /^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(trimmed)) {
    let parsed: URL
    try {
      parsed = new URL(hasScheme ? trimmed : `https://${trimmed}`)
    } catch {
      return null
    }
    if (!EURAXESS_HOST.test(parsed.hostname)) return null
    const m = parsed.pathname.match(/^\/jobs\/(\d{1,9})\/?$/)
    return m ? m[1] : null
  }
  return null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeId(opts.id)
  if (!id) {
    writeError(`Could not parse a EURAXESS offer id from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    const html = await htmlFetch(`${BASE}/jobs/${id}`)
    const job = html === null ? null : parseDetail(html, id)
    if (!job) {
      writeError(`Offer ${id} not found - it may have been withdrawn`, "NOT_FOUND")
      return 1
    }
    const c = stripInvisible(job)
    if (opts.format === "plain") {
      const s = c.fundingSignals
      const lines = [
        c.title,
        `${c.company || "—"} · ${c.location || "—"}`,
        "",
        c.positions.length ? `Positions: ${c.positions.join(", ")}` : "",
        c.profiles.length ? `Profile: ${c.profiles.join(", ")}` : "",
        c.researchFields.length ? `Fields: ${c.researchFields.join("; ")}` : "",
        c.contractType || c.jobStatus ? `Contract: ${[c.contractType, c.jobStatus, c.hoursPerWeek && `${c.hoursPerWeek} h/week`].filter(Boolean).join(", ")}` : "",
        c.fundingProgramme.length ? `EU programme: ${c.fundingProgramme.join(", ")}` : "",
        `Funding hints: ${s.funded.join(", ") || "none"}${s.unfunded.length ? ` | warnings: ${s.unfunded.join(", ")}` : ""}`,
        s.eligibility.length ? `Eligibility hints: ${s.eligibility.join(", ")}` : "",
        c.date ? `Posted: ${c.date}` : "",
        c.deadline ? `Deadline: ${c.deadline}` : "",
        c.startDate ? `Starts: ${c.startDate}` : "",
        "",
        c.description || "(no description)",
        c.requirements ? `\nREQUIREMENTS\n${c.requirements}` : "",
        c.additionalInformation ? `\nADDITIONAL INFORMATION\n${c.additionalInformation}` : "",
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
