// Programme detail page: a server-rendered <dt>/<dd> list. The title is the
// page <title> minus DAAD's suffix; the university is the header subtitle.
// Anchors verified on 2026-11-26 (see url-reference.md).

import { BASE, clean } from "./helpers.js"

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
  const subject = d.admissionRequirements?.match(
    /Bachelor['’]?s degree\)?\s+in\s+([^.;:]{3,80}?)(?=\s+(?:Proof|with|and proof)\b|[.;:]|$)/i,
  )?.[1]
  const english = d.englishSkills ?? ""
  const german = d.germanSkills ?? ""
  const combined = (d.combinedPhdText ?? "").trim().toLowerCase()
  return {
    bachelorSubject: subject ? subject.trim() : null,
    englishLevel: english.match(/\b(B1|B2|C1|C2)\b/)?.[1] ?? null,
    englishCertificate: /certificate|IELTS|TOEFL|Cambridge|PTE/i.test(english),
    ielts: english.match(/IELTS[^:]*:\s*([\d.]+)/i)?.[1] ?? null,
    toefl: english.match(/TOEFL iBT[^:]*:\s*(\d+)/i)?.[1] ?? null,
    germanRequired: /no minimum language level|not required|\bnone\b/i.test(german)
      ? false
      : (german.match(/\b([ABC][12])\b/)?.[1] ?? null),
    uniAssist: /uni-assist/i.test([d.applicationPeriods, d.submitVia, d.admissionRequirements].join(" ")),
    combinedPhd: combined === "yes" ? true : combined === "no" ? false : null,
  }
}

/** Label → cleaned value of each <dt>/<dd> pair; the first occurrence of a label wins. */
function definitions(html: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const [, dt, dd] of html.matchAll(/<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi)) {
    const label = clean(dt)
    if (label && !out.has(label)) out.set(label, clean(dd))
  }
  return out
}

export function parseDetail(html: string, id: string): ProgrammeDetail | null {
  const defs = definitions(html)
  if (defs.size === 0) return null
  const get = (label: string) => defs.get(label) || null

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
    admissionRequirements: get("Academic admission requirements"),
    germanSkills: get("German language skills"),
    englishSkills: get("English language skills"),
    submitVia: get("Submit application via"),
  }
  return { ...base, requirementSignals: requirementSignals({ ...base, combinedPhdText: get(COMBINED_PHD) }) }
}
