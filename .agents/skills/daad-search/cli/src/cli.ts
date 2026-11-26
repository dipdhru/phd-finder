#!/usr/bin/env bun
// Self-contained CLI for the DAAD International Programmes database:
// English-taught master's programmes in Berlin and Brandenburg. No external
// CLI framework and zero runtime dependencies.

import { runSearch, type SearchOpts } from "./commands/search.js"
import { DEFAULT_CITIES, canonicalCity } from "./query.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = { q: "query", n: "limit" }
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

const HELP = `daad-cli — English-taught master's programmes in Berlin and Brandenburg (DAAD International Programmes)

USAGE
  bun run src/cli.ts search [flags]
  bun run src/cli.ts detail <id|url> [--format json|plain]

Defaults: master's level, taught in English, the cities below, no tuition fees.

SEARCH FLAGS
  --query, -q <text>     Keywords, e.g. "data science", health.
  --city <list>          Comma-separated city names. Default:
                         ${DEFAULT_CITIES.join(", ")}.
  --fees <free|any>      free (default): only programmes with no tuition fees.
  --start <season>       winter | summer | any (default).
  --open-only            Drop programmes whose listed deadline has passed
                         (DAAD sometimes still shows last year's date, so these
                         are kept and marked "past" by default).
  --pages <n>            Result pages to scan (1-5, 100 programmes each). Default 2.
  --limit, -n <n>        Cap results emitted.
  --format <fmt>         json (default) | table | plain.

EXAMPLES
  bun run src/cli.ts search --format table
  bun run src/cli.ts search -q health --format plain
  bun run src/cli.ts search -q "data science" --start winter --open-only --format table
  bun run src/cli.ts detail 5252 --format plain
`

const KNOWN_FLAGS: Record<string, Set<string>> = {
  search: new Set(["query", "city", "fees", "start", "open-only", "pages", "limit", "format", "help", "h"]),
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
    for (const name of ["query", "city"]) {
      const v = flags[name]
      if (v !== undefined && (typeof v !== "string" || !v.trim())) return fail(`--${name} requires a non-empty value`)
    }
    const fmt = flags.format !== undefined ? String(flags.format) : "json"
    if (!["json", "table", "plain"].includes(fmt)) return fail(`--format must be one of json|table|plain, got "${fmt}"`)
    const fees = flags.fees === undefined ? "free" : choiceFlag("fees", flags.fees, ["free", "any"])
    const start = flags.start === undefined ? "any" : choiceFlag("start", flags.start, ["winter", "summer", "any"])
    if (fees === null || start === null) return 1
    if (flags["open-only"] !== undefined && flags["open-only"] !== true) return fail("--open-only takes no value")

    const cities =
      typeof flags.city === "string" ? flags.city.split(",").map((c) => c.trim()).filter(Boolean).map(canonicalCity) : DEFAULT_CITIES
    if (cities.length === 0) return fail("--city requires at least one city name")

    const opts: SearchOpts = {
      query: typeof flags.query === "string" ? flags.query.trim() : undefined,
      cities,
      fees: fees as SearchOpts["fees"],
      start: start as SearchOpts["start"],
      openOnly: flags["open-only"] === true,
      pages: 2,
      format: fmt as SearchOpts["format"],
    }
    const ints: [string, "pages" | "limit", number, number][] = [
      ["pages", "pages", 1, 5],
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

  return fail(`Unknown command "${cmd}"`, "BAD_CMD")
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    process.stderr.write(JSON.stringify({ error: e instanceof Error ? e.message : String(e), code: "INTERNAL_ERROR" }) + "\n")
    process.exit(1)
  })
