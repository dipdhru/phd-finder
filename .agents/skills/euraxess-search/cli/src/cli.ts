#!/usr/bin/env bun
// Self-contained CLI for EURAXESS, the European Commission's research-jobs
// portal: PhD, master's-level research and postdoc positions across Europe.
// No external CLI framework and zero runtime dependencies.

import { runSearch, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"
import { COUNTRIES, LEVELS, PROFILES, PROGRAMMES, SORTS, fold } from "./helpers.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = { q: "query", l: "location", c: "country", n: "limit" }
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

const HELP = `euraxess-cli — search EURAXESS research jobs (PhD, master's, postdoc; Europe-wide)

USAGE
  bun run src/cli.ts search [flags]
  bun run src/cli.ts detail <id|url> [--format json|plain]

Filters run on the EURAXESS server; each results page holds 10 offers.

SEARCH FLAGS
  --query, -q <text>      Keywords (every word must appear somewhere in the offer).
  --level <level>         ${Object.keys(LEVELS).join(" | ")}. Default phd.
  --country, -c <list>    Comma-separated countries, e.g. germany,netherlands (OR-ed).
  --profile <list>        Researcher profile r1,r2,r3,r4 (r1 = first-stage / doctoral).
  --programme <list>      EU funding: ${Object.keys(PROGRAMMES).join(",")} (OR-ed).
  --location, -l <text>   Substring of the work location (city, institute), checked here.
  --jobage <days>         Posted within N days (1-90).
  --sort <order>          posted (newest first, default) | deadline (closing soonest).
  --pages <n>             Result pages to scan (1-10). Default 3.
  --page <n>              First page to scan, 1-indexed. Default 1.
  --limit, -n <n>         Cap results emitted.
  --format <fmt>          json (default) | table | plain.

EXAMPLES
  bun run src/cli.ts search -q geophysics --format table
  bun run src/cli.ts search -c germany -q "machine learning" --jobage 14 --format table
  bun run src/cli.ts search --programme msca --sort deadline --format plain
  bun run src/cli.ts detail 479677 --format plain
`

const KNOWN_FLAGS: Record<string, Set<string>> = {
  search: new Set([
    "query", "level", "country", "profile", "programme", "location", "jobage", "sort", "pages", "page", "limit", "format", "help", "h",
  ]),
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

/** A comma-separated list whose every item is a key of `table`; the mapped values, or null after writing the error. */
function listFlag(name: string, raw: string | boolean | string[], table: Record<string, string>): string[] | null {
  const items = typeof raw === "string" ? raw.split(",").map((s) => fold(s.trim())).filter(Boolean) : []
  if (items.length === 0) {
    fail(`--${name} requires a value`)
    return null
  }
  const out: string[] = []
  for (const item of items) {
    if (!(item in table)) {
      fail(`--${name}: unknown value "${item}" - expected ${Object.keys(table).join(", ")}`)
      return null
    }
    if (!out.includes(table[item])) out.push(table[item])
  }
  return out
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

    let level: string | null = LEVELS.phd
    if (flags.level !== undefined) {
      const v = typeof flags.level === "string" ? flags.level.trim().toLowerCase() : ""
      if (!(v in LEVELS)) return fail(`--level must be one of ${Object.keys(LEVELS).join("|")}, got "${flags.level}"`)
      level = LEVELS[v]
    }
    let sort: SearchOpts["sort"] = "posted"
    if (flags.sort !== undefined) {
      const v = typeof flags.sort === "string" ? flags.sort.trim().toLowerCase() : ""
      if (!(v in SORTS)) return fail(`--sort must be one of ${Object.keys(SORTS).join("|")}, got "${flags.sort}"`)
      sort = v as SearchOpts["sort"]
    }

    const opts: SearchOpts = {
      query: typeof flags.query === "string" ? flags.query.trim() : undefined,
      location: typeof flags.location === "string" ? flags.location.trim() : undefined,
      level,
      countries: [],
      profiles: [],
      programmes: [],
      sort,
      page: 1,
      pages: 3,
      format: fmt as SearchOpts["format"],
    }
    const lists: [string, "countries" | "profiles" | "programmes", Record<string, string>][] = [
      ["country", "countries", COUNTRIES],
      ["profile", "profiles", PROFILES],
      ["programme", "programmes", PROGRAMMES],
    ]
    for (const [name, key, table] of lists) {
      if (flags[name] === undefined) continue
      const v = listFlag(name, flags[name], table)
      if (v === null) return 1
      opts[key] = v
    }
    const ints: [string, "jobage" | "pages" | "page" | "limit", number, number][] = [
      ["jobage", "jobage", 1, 90],
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
    const opts: DetailOpts = { id, format: fmt as DetailOpts["format"] }
    return runDetail(opts)
  }

  return fail(`Unknown command "${cmd}"`, "BAD_CMD")
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    process.stderr.write(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e), code: "INTERNAL_ERROR" }) + "\n",
    )
    process.exit(1)
  })
