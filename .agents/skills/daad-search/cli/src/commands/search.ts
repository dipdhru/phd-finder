import { delayMs, fetchText, sleep, stripInvisible, writeError } from "../helpers.js"
import { ParseError, isFree, parseSearchResponse, type Programme } from "../parse-search.js"
import { PAGE_SIZE, searchUrl, type SearchParams } from "../query.js"

export interface SearchOpts extends SearchParams {
  fees: "free" | "any"
  start: "winter" | "summer" | "any"
  openOnly: boolean
  pages: number // result pages to scan (100 programmes each)
  limit?: number
  format: "json" | "table" | "plain"
}

/** The "can I take this" filters, applied to every mapped programme. */
function keep(p: Programme, opts: SearchOpts): boolean {
  if (opts.fees === "free" && !isFree(p.tuitionFees)) return false
  if (opts.start !== "any" && !(p.beginning ?? "").toLowerCase().includes(`${opts.start} semester`)) return false
  if (opts.openOnly && p.deadlineStatus === "past") return false
  return true
}

const deadlineCell = (p: Programme) => `${p.deadlineStatus}${p.deadline ? ` ${p.deadline}` : ""}`

function renderTable(rows: Programme[]): string {
  if (rows.length === 0) return "No results."
  const header =
    "ID".padEnd(6) + " " + "TITLE".padEnd(44) + " " + "UNIVERSITY".padEnd(30) + " " + "CITY".padEnd(12) + " " + "FEES".padEnd(16) + " DEADLINE"
  const lines = rows.map((p) =>
    [
      p.id.padEnd(6),
      p.title.slice(0, 44).padEnd(44),
      (p.company || "—").slice(0, 30).padEnd(30),
      (p.location || "—").slice(0, 12).padEnd(12),
      (p.tuitionFees || "—").slice(0, 16).padEnd(16),
      deadlineCell(p),
    ].join(" "),
  )
  return [header, "-".repeat(header.length), ...lines].join("\n")
}

function renderPlain(p: Programme): string {
  return [
    p.title,
    `  ${p.company || "—"} · ${p.location || "—"}`,
    `  starts ${p.beginning || "—"} · fees ${p.tuitionFees || "—"} · duration ${p.duration || "—"}`,
    `  deadline: ${(p.deadlineText || "—").replace(/\n+/g, " / ")}  [${deadlineCell(p)}]`,
    `  id: ${p.id}`,
    `  ${p.url}`,
  ].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const today = new Date()
    const results: Programme[] = []
    const seen = new Set<string>()
    let scanned = 0
    let total = 0
    for (let page = 0; page < opts.pages; page++) {
      if (page > 0) await sleep(delayMs())
      const offset = page * PAGE_SIZE
      const body = await fetchText(searchUrl(opts, offset), "application/json")
      if (body === null) throw new ParseError("DAAD search endpoint not found (404) - the API may have moved")
      const parsed = parseSearchResponse(body, today)
      total = parsed.total
      scanned++
      for (const p of parsed.programmes) {
        if (seen.has(p.id)) continue
        seen.add(p.id)
        if (keep(p, opts)) results.push(p)
      }
      if (opts.limit !== undefined && results.length >= opts.limit) break
      if (parsed.count < PAGE_SIZE || offset + PAGE_SIZE >= total) break
    }
    // Everything is collected before anything is written, so a failed page
    // leaves stdout empty rather than holding half a result.
    const out = stripInvisible(opts.limit !== undefined ? results.slice(0, opts.limit) : results)

    if (opts.format === "table") {
      process.stdout.write(renderTable(out) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write((out.length ? out.map(renderPlain).join("\n\n") : "No results.") + "\n")
    } else {
      process.stdout.write(JSON.stringify({ meta: { count: out.length, pagesScanned: scanned, total }, results: out }, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), e instanceof ParseError ? "PARSE_FAILED" : "SEARCH_FAILED")
    return 1
  }
}
