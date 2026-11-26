// Programme detail page: a server-rendered <dt>/<dd> list. The title is the
// page <title> minus DAAD's suffix; the university is the header subtitle.
// Anchors verified on 2026-11-26 (see url-reference.md).

import { BASE, clean, cleanMultiline } from "./helpers.js"

export interface RequirementSignals {
  /** Subject phrase after "Bachelor's degree in", e.g. "Computer Science or a related subject". */
  bachelorSubject: string | null
  englishLevel: string | null
  englishCertificate: boolean
  ielts: string | null
  toefl: string | null
  /** false when no German is needed, a CEFR level when one is named, null when unclear. */
  germanRequired: string | false | null
  uniAssist: boolean
  combinedPhd: boolean | null
}

export interface ProgrammeDetail {
  id: string
  title: string
  company: string | null
  location: string | null
  country: "Germany"
  url: string
  degree: string | null
  cooperation: string | null
  teachingLanguage: string | null
  duration: string | null
  beginning: string | null
  applicationPeriods: string | null
  tuitionFees: string | null
  semesterContribution: string | null
  costsOfLiving: string | null
  admissionRequirements: string | null
  germanSkills: string | null
  englishSkills: string | null
  submitVia: string | null
  requirementSignals: RequirementSignals
}

const COMBINED_PHD = "Combined Master's degree / PhD programme"

/** Hints for the applicant to check, not an admission verdict. */
export function requirementSignals(d: Omit<ProgrammeDetail, "requirementSignals"> & { combinedPhdText?: string | null }): RequirementSignals {
  // "(e.g. Bachelor's degree) in X" or "Bachelor's degree (BSc) in X"; the
  // subject ends at a line break (one list item per line), a bracket such as
  // "(e.g. …", or the next sentence.
  const subject = d.admissionRequirements?.match(
    /Bachelor['’]?s degree\)?(?:\s*\([^)]*\))?\s+in\s+([^.;:\n(]{3,80}?)(?=\s+(?:Proof|with|and proof)\b|\s*\(|[.;:\n]|$)/i,
  )?.[1]
  const english = d.englishSkills ?? ""
  const german = d.germanSkills ?? ""
  const combined = (d.combinedPhdText ?? "").trim().toLowerCase()
  // A named German level or test always wins: "not required for admission, but
  // B1 by the second semester" still needs German.
  const germanLevel = german.match(/\b([ABC][12])\b/)?.[1] ?? german.match(/\b(DSH(?:-\d)?|TestDaF|telc)\b/i)?.[1] ?? null
  const germanNone = /no minimum language level|not required/i.test(german) || /^\s*none\.?\s*$/i.test(german)
  return {
    bachelorSubject: subject ? subject.trim() : null,
    englishLevel: english.match(/\b(B1|B2|C1|C2)\b/)?.[1] ?? null,
    englishCertificate:
      /\bcertificate\b|\bIELTS\b|\bTOEFL\b|\bCambridge\b|\bPTE\b/i.test(english) &&
      !/\bno (?:language )?certificate\b|\bcertificate (?:is )?not required\b/i.test(english),
    // Each score is read right after its own test name, so "IELTS 6.5 or TOEFL iBT: 88" can't swap them.
    ielts: english.match(/\bIELTS(?:\s+Academic)?\s*(?:\([^)]*\))?\s*:?\s*(\d(?:\.\d)?)\b/i)?.[1] ?? null,
    toefl: english.match(/\bTOEFL(?:\s+iBT)?(?:\s+Home Edition)?\s*(?:\([^)]*\))?\s*:?\s*(\d{2,3})\b/i)?.[1] ?? null,
    germanRequired: germanLevel ?? (germanNone ? false : null),
    uniAssist: /uni-assist/i.test([d.applicationPeriods, d.submitVia, d.admissionRequirements].join(" ")),
    combinedPhd: combined === "yes" ? true : combined === "no" ? false : null,
  }
}

/** Label → raw value HTML of each <dt>/<dd> pair; the first occurrence of a label wins. */
function definitions(html: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const [, dt, dd] of html.matchAll(/<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi)) {
    const label = clean(dt)
    if (label && !out.has(label)) out.set(label, dd)
  }
  return out
}

export function parseDetail(html: string, id: string): ProgrammeDetail | null {
  const defs = definitions(html)
  if (defs.size === 0) return null
  const get = (label: string) => clean(defs.get(label) ?? "") || null
  // Lists keep one item per line, so requirements stay readable and a subject
  // capture can't run into the next item.
  const lines = (label: string) => cleanMultiline(defs.get(label) ?? "") || null

  const pageTitle = clean(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+-\s+International Programmes\s+-\s+DAAD$/i, "")
  const subtitle = html.match(/class="c-detail-header__subtitle[^"]*"[^>]*>([\s\S]*?)<\/h[1-6]>/i)?.[1]
  const company = subtitle ? clean(subtitle).split("•")[0].trim() || null : null

  const base = {
    id,
    title: pageTitle || `Programme ${id}`,
    company,
    location: get("Course location"),
    country: "Germany" as const,
    url: `${BASE}/deutschland/studienangebote/international-programmes/en/detail/${id}/`,
    degree: get("Degree"),
    cooperation: get("In cooperation with"),
    teachingLanguage: get("Teaching language"),
    duration: get("Programme duration"),
    beginning: get("Beginning"),
    applicationPeriods: get("Application periods"),
    tuitionFees: get("Tuition fees per semester"),
    semesterContribution: get("Semester contribution"),
    costsOfLiving: get("Costs of living"),
    admissionRequirements: lines("Academic admission requirements"),
    germanSkills: lines("German language skills"),
    englishSkills: lines("English language skills"),
    submitVia: get("Submit application via"),
  }
  return { ...base, requirementSignals: requirementSignals({ ...base, combinedPhdText: get(COMBINED_PHD) }) }
}
