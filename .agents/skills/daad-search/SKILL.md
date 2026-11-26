---
name: daad-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to find a master's programme to study in Germany,
  especially in Berlin, Potsdam or elsewhere in Brandenburg: English-taught master's,
  tuition-free master's, MSc programmes, or a programme on DAAD's "International Programmes"
  database. It searches DAAD's database and by default keeps only programmes the user can
  realistically take: master's level, taught in English, in Berlin or Brandenburg, with no
  tuition fees. Trigger phrases: master's in Germany, master's in Berlin, master's in
  Potsdam, master's in Brandenburg, English-taught master's, tuition-free master's, MSc
  Germany, study in Berlin, DAAD, international programmes, Masterstudium, Masterstudiengang.
context: fork
enabled: true  # set to false to keep this source installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/daad-search/cli/src/cli.ts *)
---

# DAAD Master's Search Skill

Searches [DAAD International Programmes](https://www2.daad.de/deutschland/studienangebote/international-programmes/en/),
the German Academic Exchange Service's database of internationally oriented degree
programmes. The CLI calls the JSON endpoint behind its search page and reads the public
detail pages. No key is needed. `www2.daad.de` has no `robots.txt`, and requests are spaced
2 s apart to match `www.daad.de`'s `Crawl-delay: 2`.

**Defaults:**
- master's level;
- taught in English;
- in Berlin, Potsdam, Cottbus, Frankfurt (Oder), Eberswalde, Wildau, Senftenberg or Brandenburg an der Havel;
- **no tuition fees**.

On 2026-11-26 that matched 92 of the 177 English-taught master's programmes DAAD lists in those cities.

## Commands

### Search

```bash
bun run .agents/skills/daad-search/cli/src/cli.ts search [flags]
```

- `--query`/`-q <text>`: keywords, e.g. `"data science"`, `health`, `bioinformatics`.
- `--city <list>`: comma-separated city names (matched case-insensitively), replacing the default list. Cities outside the list are passed as typed, e.g. `--city Leipzig`.
- `--fees free|any`: `free` (default) keeps only programmes DAAD marks "No tuition fees". `any` also shows fee-paying programmes, which are mostly at private universities.
- `--start winter|summer|any`: start semester. Default `any`.
- `--open-only`: drop programmes whose listed deadline has passed.
- `--pages <n>`: result pages to scan (1-5, 100 programmes each, default 2). `--limit`/`-n <n>`, `--format json|table|plain`.

### Detail

```bash
bun run .agents/skills/daad-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

Returns the programme's details:
- degree, partner institutions, teaching language, duration and start semester;
- application periods;
- tuition and semester fee, and cost of living;
- full admission requirements and the German and English language requirements;
- how to apply;
- whether it is a combined master's/PhD programme.

## Requirement and deadline hints

`detail` adds `requirementSignals`:

- `bachelorSubject`: the subject after "Bachelor's degree in", e.g. "Computer Science or a related subject".
- `englishLevel`, `englishCertificate`, `ielts`, `toefl`: what the English section asks for.
- `germanRequired`: `false` when no German is needed, a level such as `B2` when one is named, `null` when unclear.
- `uniAssist`: whether applications go through uni-assist.
- `combinedPhd`: whether it is a combined master's/PhD programme.

These are **hints for the applicant to check, not an admission decision**. "Or a related
subject" is decided by the university: tell the user to read the admission text and, when in
doubt, email the programme before applying.

`search` gives every result a `deadlineStatus`:
- `open`: a listed date is still ahead, or DAAD shows "+ N more" dates.
- `past`: every listed date has gone.
- `unknown`: no date with a year, e.g. "no deadline", or free text such as "1 June (first semester)".

Past programmes are **kept by default**, because DAAD often still shows last year's date for a
programme that reopens on the same date this year. `--open-only` removes them.

## Visa notes for a student in Berlin (checked 2026-11-26)

These are general notes, not legal advice. The Berlin immigration office (LEA) decides each case.

- Moving from a §20 AufenthG job-search permit to studying means applying for a **§16b student residence permit** from inside Germany.
- **Proof of funds:**
  - Income from a work contract can count instead of a blocked account (Sperrkonto), **but only if it covers LEA's required monthly amount**. Otherwise a blocked account, a scholarship, or a declaration of commitment (Verpflichtungserklärung) is needed.
  - Berlin's own pages give different yearly figures, so check LEA's current amount.
- **§16b students may work at most 140 full days (or 280 half days) a year**, so a job used as proof of funds must fit within that limit.
- Studying in Potsdam or elsewhere in Brandenburg while living in Berlin keeps Berlin's LEA as the responsible office.

## Usage examples

```bash
# Tuition-free English-taught master's in Berlin and Brandenburg
bun run .agents/skills/daad-search/cli/src/cli.ts search --format table

# Health-related programmes, with deadlines
bun run .agents/skills/daad-search/cli/src/cli.ts search -q health --format plain

# Data science programmes starting in winter, deadline not passed
bun run .agents/skills/daad-search/cli/src/cli.ts search -q "data science" --start winter --open-only --format table

# Only Potsdam, fee-paying programmes included
bun run .agents/skills/daad-search/cli/src/cli.ts search --city potsdam --fees any --format table

# Full programme with admission requirement hints (Digital Health, University of Potsdam / HPI)
bun run .agents/skills/daad-search/cli/src/cli.ts detail 5252 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default. Used by `/scrape`. |
| `table` | Quick comparisons, with fees and deadline status |
| `plain` | Reading results, or a single programme with `detail` |

JSON search output is `{ "meta": { "count", "pagesScanned", "total" }, "results": [...] }`.
`total` is DAAD's count before the fee, start and open-only filters. Each result has these fields:
- `id`, `title`, `url`;
- `company` (the university), `location` (the city), `country` (always "Germany");
- `languages`, `beginning`, `duration`, `tuitionFees`, `subject`;
- `deadline`, `deadlineText`, `deadlineStatus`.

Field names match the other skills where they mean the same thing. Errors go to stderr as
`{ "error", "code" }` and the CLI exits with code 1. The codes are `BAD_ARG`,
`UNKNOWN_FLAG`, `SEARCH_FAILED`, `PARSE_FAILED`, `BAD_ID`, `NOT_FOUND`, `DETAIL_FAILED`,
`NO_ID`, `BAD_CMD` and `INTERNAL_ERROR`. `PARSE_FAILED` means the response wasn't the
expected data. It never means "no programmes".

## Notes

- **Coverage is DAAD's international selection only.** Some English-taught master's at TU Berlin, FU, HU or other universities may not be listed, and German-taught programmes are out of scope. Check the universities' own programme pages too.
- "Tuition varies" and amounts such as "9,950" are fee-paying programmes, often at private universities.
- Programme text is university-supplied HTML. It is run through the hidden-markup and invisible-character filters before output.
- Endpoint notes and parsing anchors are in `url-reference.md`.
