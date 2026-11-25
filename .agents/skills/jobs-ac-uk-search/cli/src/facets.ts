// jobs.ac.uk search facets. Values are the search page's own facet slugs,
// verified live on 2026-11-21 (see url-reference.md). Different facets are
// AND-ed by the site.

import { BASE } from "./helpers.js"

/** Advert types. `any` is two scans, PhDs then masters: see url-reference.md. */
export const TYPES: Record<"phd" | "masters" | "any", string[]> = {
  phd: ["phds"],
  masters: ["masters"],
  any: ["phds", "masters"],
}

/** Who a studentship's funding is open to. `any` sends no funding facet. */
export const FUNDING: Record<string, string | null> = {
  international: "international-students",
  eu: "eu-students",
  uk: "uk-students",
  self: "self-funded-students",
  any: null,
}

export const DISCIPLINES: string[] = [
  "agriculture-food-and-veterinary", "architecture-building-and-planning", "biological-sciences",
  "business-and-management-studies", "computer-sciences", "creative-arts-and-design", "economics",
  "education-studies-inc-tefl", "engineering-and-technology", "health-and-medical",
  "historical-and-philosophical-studies", "information-management-and-librarianship",
  "languages-literature-and-culture", "law", "mathematics-and-statistics", "media-and-communications",
  "physical-and-environmental-sciences", "politics-and-government", "psychology",
  "social-sciences-and-social-care", "sport-and-leisure",
]

export const LOCATION_ALIASES: Record<string, string> = {
  uk: "united-kingdom",
  "united kingdom": "united-kingdom",
  britain: "united-kingdom",
  "great britain": "united-kingdom",
  deutschland: "germany",
}

/** 1 = newest first; 2 = closing soonest (Closes dates ascend, checked 2026-11-21). */
export const SORTS: Record<"posted" | "closing", number> = { posted: 1, closing: 2 }

export interface SearchParams {
  query?: string
  /** Advert type slugs for one scan, e.g. ["phds"]. */
  types: string[]
  funding: string | null
  discipline?: string
  location?: string
  sort: "posted" | "closing"
}

/** A location facet slug: a known alias, else the input lowercased with spaces as hyphens. */
export function locationSlug(input: string): string {
  const key = input.trim().toLowerCase().replace(/\s+/g, " ")
  return LOCATION_ALIASES[key] ?? key.replace(/ /g, "-").replace(/[^a-z-]/g, "")
}

export const PAGE_SIZE = 25

export function searchUrl(p: SearchParams, startIndex: number): string {
  const q = new URLSearchParams()
  q.set("sortOrder", String(SORTS[p.sort]))
  q.set("pageSize", String(PAGE_SIZE))
  q.set("startIndex", String(startIndex))
  if (p.query) q.set("keywords", p.query)
  p.types.forEach((t, i) => q.set(`jobTypeFacet[${i}]`, t))
  if (p.funding) q.set("fundingTypeFacet[0]", p.funding)
  if (p.discipline) q.set("academicDisciplineFacet[0]", p.discipline)
  if (p.location) q.set("locationFacet[0]", p.location)
  return `${BASE}/search/?${q.toString()}`
}
