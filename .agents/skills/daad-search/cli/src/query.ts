// DAAD International Programmes search API parameters (verified 2026-11-26;
// see url-reference.md). degree[]=2 is master's, lang[]=2 is English; cit[]
// takes plain city names, several of which are OR-ed.

import { BASE } from "./helpers.js"

export const SEARCH_PATH = "/deutschland/studienangebote/international-programmes/api/solr/en/search.json"

/** Berlin and the Brandenburg cities with listed programmes (plus Brandenburg an der Havel). */
export const DEFAULT_CITIES: string[] = [
  "Berlin",
  "Potsdam",
  "Cottbus",
  "Frankfurt (Oder)",
  "Eberswalde",
  "Wildau",
  "Senftenberg",
  "Brandenburg an der Havel",
]

/** The DAAD spelling of a known city, matched case-insensitively; other names pass as typed. */
export function canonicalCity(input: string): string {
  const key = input.trim().replace(/\s+/g, " ").toLowerCase()
  return DEFAULT_CITIES.find((c) => c.toLowerCase() === key) ?? input.trim()
}

export interface SearchParams {
  query?: string
  cities: string[]
}

export const PAGE_SIZE = 100

export function searchUrl(p: SearchParams, offset: number): string {
  const q = new URLSearchParams()
  q.append("degree[]", "2")
  q.append("lang[]", "2")
  for (const city of p.cities) q.append("cit[]", city)
  if (p.query) q.set("q", p.query)
  q.set("limit", String(PAGE_SIZE))
  q.set("offset", String(offset))
  q.set("sort", "4")
  q.set("display", "list")
  return `${BASE}${SEARCH_PATH}?${q.toString()}`
}
