import {
  htmlFetch,
  locationMatches,
  parseSearchPage,
  searchUrl,
  stripInvisible,
  writeError,
  type JobCard,
  type SearchParams,
} from "../helpers.js"

export interface SearchOpts extends SearchParams {
  location?: string
  jobage?: number
  page: number // first results page to scan, 1-indexed
  pages: number // how many results pages to scan (10 offers each)
  limit?: number
  format: "json" | "table" | "plain"
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const header =
    "ID".padEnd(7) + " " + "TITLE".padEnd(48) + " " + "ORGANISATION".padEnd(28) + " " + "COUNTRY".padEnd(12) + " " + "POSTED".padEnd(10) + " DEADLINE"
  const rows = cards.map((c) =>
    [
      c.id.padEnd(7),
      c.title.slice(0, 48).padEnd(48),
      (c.company || "—").slice(0, 28).padEnd(28),
      (c.country || "—").slice(0, 12).padEnd(12),
      (c.date || "—").padEnd(10),
      c.deadline || "—",
    ].join(" "),
  )
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

function renderPlain(c: JobCard): string {
  const lines = [
    c.title,
    `  ${c.company || "—"} · ${c.location || "—"}`,
    `  posted ${c.date || "—"} · deadline ${c.deadline || "—"}${c.offers && c.offers > 1 ? ` · ${c.offers} positions` : ""}`,
  ]
  if (c.fundingProgramme.length) lines.push(`  funding: ${c.fundingProgramme.join(", ")}`)
  if (c.researchFields.length) lines.push(`  fields: ${c.researchFields.join("; ")}`)
  lines.push(`  id: ${c.id}`, `  ${c.url}`)
  return lines.join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    // Posted dates are whole days, so compare dates, not timestamps.
    const cutoff = opts.jobage !== undefined ? new Date(Date.now() - opts.jobage * 86400000).toISOString().slice(0, 10) : null
    const cards: JobCard[] = []
    // A new offer shifts every page down by one during a scan, so the last
    // card of one page can reappear at the top of the next.
    const seen = new Set<string>()
    let scanned = 0
    let total: number | null = null
    for (let page = opts.page; page < opts.page + opts.pages; page++) {
      const html = await htmlFetch(searchUrl(opts, page - 1))
      if (html === null) break
      const parsed = parseSearchPage(html)
      total = parsed.total ?? total
      scanned++
      let pastCutoff = false
      for (const c of parsed.cards) {
        if (cutoff !== null && c.date !== null && c.date < cutoff) {
          pastCutoff = true
          continue
        }
        if (opts.location && !locationMatches(c.location, opts.location)) continue
        if (seen.has(c.id)) continue
        seen.add(c.id)
        cards.push(c)
      }
      // Sorted newest first, so past the cutoff no later page can match.
      if (pastCutoff && opts.sort === "posted") break
      if (parsed.cards.length === 0 || (total !== null && page * 10 >= total)) break
      if (opts.limit !== undefined && cards.length >= opts.limit) break
    }
    const results = stripInvisible(opts.limit !== undefined ? cards.slice(0, opts.limit) : cards)

    if (opts.format === "table") {
      process.stdout.write(renderTable(results) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write((results.length ? results.map(renderPlain).join("\n\n") : "No results.") + "\n")
    } else {
      process.stdout.write(
        JSON.stringify({ meta: { count: results.length, page: opts.page, pagesScanned: scanned, total }, results }, null, 2) +
          "\n",
      )
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
