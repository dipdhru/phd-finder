import { PAGE_SIZE, searchUrl, type SearchParams } from "../facets.js"
import { delayMs, htmlFetch, sleep, stripInvisible, writeError } from "../helpers.js"
import { parseSearchPage, type JobCard } from "../parse-search.js"

export interface SearchOpts extends SearchParams {
  page: number // first results page to scan, 1-indexed
  pages: number // results pages to scan per advert type (25 adverts each)
  limit?: number
  format: "json" | "table" | "plain"
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const header =
    "ID".padEnd(7) + " " + "TITLE".padEnd(48) + " " + "ORGANISATION".padEnd(28) + " " + "LOCATION".padEnd(16) + " " + "POSTED".padEnd(10) + " CLOSES"
  const rows = cards.map((c) =>
    [
      c.id.padEnd(7),
      c.title.slice(0, 48).padEnd(48),
      (c.company || "—").slice(0, 28).padEnd(28),
      (c.location || "—").slice(0, 16).padEnd(16),
      (c.date || "—").padEnd(10),
      c.deadline || "—",
    ].join(" "),
  )
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

function renderPlain(c: JobCard): string {
  return [
    c.title,
    `  ${[c.company, c.department].filter(Boolean).join(", ") || "—"} · ${c.location || "—"}`,
    `  posted ${c.date || "—"} · closes ${c.deadline || "—"}${c.salary ? ` · ${c.salary}` : ""}`,
    `  id: ${c.id}`,
    `  ${c.url}`,
  ].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const today = new Date()
    const cards: JobCard[] = []
    // A new advert shifts every page down by one during a scan, so the last
    // card of one page can reappear at the top of the next.
    const seen = new Set<string>()
    let scanned = 0
    let total: number | null = null
    let requested = false
    const full = () => opts.limit !== undefined && cards.length >= opts.limit
    // One scan per advert type: `--type any` is PhDs, then masters.
    for (const type of opts.types) {
      if (full()) break
      let typeTotal: number | null = null
      for (let page = opts.page; page < opts.page + opts.pages; page++) {
        if (requested) await sleep(delayMs())
        requested = true
        const html = await htmlFetch(searchUrl({ ...opts, types: [type] }, (page - 1) * PAGE_SIZE + 1))
        if (html === null) break
        const parsed = parseSearchPage(html, today)
        // A results page with no cards must say so with a count of 0 (or the
        // scan must have started past the end). Anything else - a holding page,
        // a changed layout - would otherwise read as "no studentships".
        if (page === opts.page && parsed.cards.length === 0) {
          const pastEnd = parsed.total !== null && (opts.page - 1) * PAGE_SIZE >= parsed.total
          if (!pastEnd) throw new ParseError("results page has no readable adverts - jobs.ac.uk may be down or its layout may have changed")
        }
        typeTotal = parsed.total ?? typeTotal
        scanned++
        for (const c of parsed.cards) {
          if (seen.has(c.id)) continue
          seen.add(c.id)
          cards.push(c)
        }
        if (full()) break
        if (parsed.cards.length < PAGE_SIZE || (typeTotal !== null && page * PAGE_SIZE >= typeTotal)) break
      }
      if (typeTotal !== null) total = (total ?? 0) + typeTotal
    }
    // Everything is collected before anything is written: a failed page
    // leaves stdout empty rather than holding half a result.
    const results = stripInvisible(opts.limit !== undefined ? cards.slice(0, opts.limit) : cards)

    if (opts.format === "table") {
      process.stdout.write(renderTable(results) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write((results.length ? results.map(renderPlain).join("\n\n") : "No results.") + "\n")
    } else {
      process.stdout.write(
        JSON.stringify({ meta: { count: results.length, page: opts.page, pagesScanned: scanned, total }, results }, null, 2) + "\n",
      )
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), e instanceof ParseError ? "PARSE_FAILED" : "SEARCH_FAILED")
    return 1
  }
}

class ParseError extends Error {}
