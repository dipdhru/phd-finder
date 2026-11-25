#!/usr/bin/env bun
// Self-contained CLI for jobs.ac.uk: funded UK PhD and MRes/MPhil
// studentships. No external CLI framework and zero runtime dependencies.

import { runDetail, type DetailOpts } from "./commands/detail.js"
import { runSearch, type SearchOpts } from "./commands/search.js"
import { DISCIPLINES, FUNDING, SORTS, TYPES, locationSlug } from "./facets.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = { q: "query", l: "location", n: "limit" }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("--") || a.startsWith("-")) {
      const key = alias[a.replace(/^-+/, "")] ?? a.replace(/^-+/, "")
      const next = argv[i + 1]
      if (next === undefined || next.startsWith("-")) {
        flags[key] = true
      } else {
        flags[key] = next
        i++
      }
    } else {
      ;(flags._ as string[]).push(a)
    }
  }
  return flags
}

const HELP = `jobs-ac-uk-cli — search funded UK PhD and MRes/MPhil studentships on jobs.ac.uk

USAGE
  bun run src/cli.ts search [flags]
  bun run src/cli.ts detail <id|url> [--format json|plain]

Filters run on the jobs.ac.uk server; each results page holds 25 adverts.

SEARCH FLAGS
  --query, -q <text>       Keywords.
  --type <type>            ${Object.keys(TYPES).join(" | ")}. Default phd. any = PhDs, then masters.
  --funding <who>          ${Object.keys(FUNDING).join(" | ")}. Default international:
                           only studentships whose funding international students can hold.
                           Some of these still pay fees at the UK home rate only - check
                           the "home fees only" hint from \`detail\`.
  --discipline <slug>      e.g. computer-sciences, health-and-medical (see url-reference.md).
  --location, -l <place>   Location facet, e.g. uk, scotland, germany.
  --sort <order>           posted (newest first, default) | closing (closing soonest).
  --pages <n>              Result pages to scan per type (1-10). Default 3.
  --page <n>               First page to scan, 1-indexed. Default 1.
  --limit, -n <n>          Cap results emitted.
  --format <fmt>           json (default) | table | plain.

EXAMPLES
  bun run src/cli.ts search --discipline health-and-medical --format table
  bun run src/cli.ts search -q "machine learning" --sort closing --format plain
  bun run src/cli.ts search --type masters --funding any --format table
  bun run src/cli.ts detail DTS352 --format plain
`

const KNOWN_FLAGS: Record<string, Set<string>> = {
  search: new Set(["query", "type", "funding", "discipline", "location", "sort", "pages", "page", "limit", "format", "help", "h"]),
  detail: new Set(["format", "help", "h"]),
}

function fail(error: string, code = "BAD_ARG"): number {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
  return 1
}

/** Whole number in [min, max], or null after writing the error. */
function intFlag(name: string, raw: string | boolean | string[], min: number, max: number): number | null {
  // Number(), not parseInt(): parseInt truncates "0.5" to 0 and silently
  // changes the filter.
  const val = typeof raw === "string" ? Number(raw.trim()) : NaN
  if (!Number.isInteger(val) || val < min || val > max) {
    fail(`--${name} must be a whole number from ${min} to ${max}, got "${raw}"`)
    return null
  }
  return val
}

/** A value that must be one of `allowed`, lowercased; null after writing the error. */
function choiceFlag(name: string, raw: string | boolean | string[], allowed: string[]): string | null {
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : ""
  if (!allowed.includes(v)) {
    fail(`--${name} must be one of ${allowed.join("|")}, got "${raw}"`)
    return null
  }
  return v
}

async function main(): Promise<number> {
  const flags = parseFlags(process.argv.slice(2))
  const cmd = (flags._ as string[])[0]

  if (!cmd || flags.help || flags.h) {
    process.stdout.write(HELP)
    return cmd ? 0 : 1
  }

  // Reject unknown flags: a discarded filter changes what the search returns
  // with no error.
  const knownFlags = KNOWN_FLAGS[cmd]
  if (knownFlags) {
    for (const key of Object.keys(flags)) {
      if (key === "_" || knownFlags.has(key)) continue
      return fail(
        `unknown flag --${key} for '${cmd}' - flags are never silently ignored, because a discarded filter changes what the search returns; see --help for the supported flags`,
        "UNKNOWN_FLAG",
      )
    }
  }

  if (cmd === "search") {
    for (const name of ["query", "location"]) {
      const v = flags[name]
      if (v !== undefined && (typeof v !== "string" || !v.trim())) return fail(`--${name} requires a non-empty value`)
    }
    const fmt = flags.format !== undefined ? String(flags.format) : "json"
    if (!["json", "table", "plain"].includes(fmt)) return fail(`--format must be one of json|table|plain, got "${fmt}"`)

    const type = flags.type === undefined ? "phd" : choiceFlag("type", flags.type, Object.keys(TYPES))
    const funding = flags.funding === undefined ? "international" : choiceFlag("funding", flags.funding, Object.keys(FUNDING))
    const sort = flags.sort === undefined ? "posted" : choiceFlag("sort", flags.sort, Object.keys(SORTS))
    const discipline = flags.discipline === undefined ? undefined : choiceFlag("discipline", flags.discipline, DISCIPLINES)
    if (type === null || funding === null || sort === null || discipline === null) return 1

    const location = typeof flags.location === "string" ? locationSlug(flags.location) : undefined
    if (location === "") return fail(`--location: "${flags.location}" has no letters`)

    const opts: SearchOpts = {
      query: typeof flags.query === "string" ? flags.query.trim() : undefined,
      types: TYPES[type as keyof typeof TYPES],
      funding: FUNDING[funding],
      discipline,
      location,
      sort: sort as SearchOpts["sort"],
      page: 1,
      pages: 3,
      format: fmt as SearchOpts["format"],
    }
    const ints: [string, "pages" | "page" | "limit", number, number][] = [
      ["pages", "pages", 1, 10],
      ["page", "page", 1, 1000],
      ["limit", "limit", 1, 10000],
    ]
    for (const [name, key, min, max] of ints) {
      if (flags[name] === undefined) continue
      const v = intFlag(name, flags[name], min, max)
      if (v === null) return 1
      opts[key] = v
    }
    return runSearch(opts)
  }

  if (cmd === "detail") {
    const id = (flags._ as string[])[1]
    if (!id) return fail("detail requires an <id|url>", "NO_ID")
    const fmt = flags.format !== undefined ? String(flags.format) : "json"
    if (!["json", "plain"].includes(fmt)) return fail(`--format must be one of json|plain, got "${fmt}"`)
    return runDetail({ id, format: fmt as DetailOpts["format"] })
  }

  return fail(`Unknown command "${cmd}"`, "BAD_CMD")
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    process.stderr.write(JSON.stringify({ error: e instanceof Error ? e.message : String(e), code: "INTERNAL_ERROR" }) + "\n")
    process.exit(1)
  })
