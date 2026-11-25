---
name: jobs-ac-uk-search
version: 1.0.0
description: >
  Use this skill whenever the user wants funded PhD studentships, MRes or MPhil places,
  or doctoral research projects in the UK, or a posting on jobs.ac.uk. jobs.ac.uk is the
  main UK listing site for academic jobs and studentships, where universities, doctoral
  training partnerships (DTPs) and centres for doctoral training (CDTs) advertise funded
  places. It also lists some studentships in Ireland and elsewhere in Europe. Trigger
  phrases: UK PhD studentship, funded PhD UK, PhD in the UK, MRes, MPhil, doctoral
  training partnership, DTP, CDT, UKRI studentship, EPSRC/ESRC/AHRC/BBSRC/NERC/MRC
  studentship, studentships for international students, PhD Scotland, PhD Ireland,
  jobs.ac.uk.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/jobs-ac-uk-search/cli/src/cli.ts *)
---

# jobs.ac.uk Search Skill

Searches [jobs.ac.uk](https://www.jobs.ac.uk/phd) for PhD and master's studentships. The
site's RSS feeds are gone, so the CLI reads the public HTML search and advert pages. No key
is needed, and `robots.txt` allows `/search` and `/job`. Keep scans small: one page is 25
adverts, requests are spaced about a second apart, and the default is 3 pages.

**Default: PhD studentships whose funding international students can hold.** Without
`--funding`, the search sends the site's own "Funding for: International Students" filter,
which advertisers set. On 2026-11-19 that was 421 of 637 PhD adverts. Pass `--funding any`
to see everything, including UK-only places.

All filters are applied by the jobs.ac.uk server.

## Commands

### Search

```bash
bun run .agents/skills/jobs-ac-uk-search/cli/src/cli.ts search [flags]
```

- `--query`/`-q <text>`: keywords.
- `--type phd|masters|any`: advert type. Default `phd`. `masters` covers MRes/MPhil and master's studentships. `any` scans PhDs, then masters.
- `--funding international|eu|uk|self|any`: who the funding is open to. Default `international`. `self` is self-funded places.
- `--discipline <slug>`: subject area. The 21 slugs include `computer-sciences`, `health-and-medical`, `mathematics-and-statistics`, `biological-sciences` and `engineering-and-technology` (full list in `url-reference.md`).
- `--location`/`-l <place>`: the site's location facet, e.g. `uk`, `scotland`, `ireland`, `germany`.
- `--sort posted|closing`: newest first (default) or closing soonest.
- `--pages <n>`: pages to scan per type (1-10, default 3). `--page <n>`: first page (default 1).
- `--limit`/`-n <n>`, `--format json|table|plain`.

### Detail

```bash
bun run .agents/skills/jobs-ac-uk-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

Takes an advert id such as `DTS352`, or its jobs.ac.uk URL. Returns the full advert:
- organisation, location and country;
- posted and closing dates;
- qualification type, who the funding is for, and the funding amount;
- hours, the advert's reference, start date, duration and sponsor;
- supervisors and the eligibility criteria;
- the full description;
- the employer's application link (`applyUrl`).

## Funding and eligibility hints

`detail` adds `fundingSignals`, phrases found in the advert:

- `funded`: e.g. `studentship`, `stipend`, `UKRI rate`, `tax-free stipend`, `living allowance`, `tuition covered`, `MSCA`.
- `unfunded`: e.g. `self-funded`, `own funding required`, `tuition fees apply`.
- `eligibility`: e.g. `home fees only`, `UK students only`, `international students eligible`, `international students not eligible`, `home-fee status`, `nationality restriction`.

**`home fees only` matters most for an international applicant.** Many UK studentships pay
tuition only at the UK "home" rate. An international student would then owe the difference
to the international fee, which is often over £20,000 a year. `--funding international`
does not remove these adverts: an advert can be open to international students and still
cover home fees only.

The hint fires on any mention of home-rate fees, such as "UK Home only", "home fees" or
"fees at the home rate". It is dropped when the advert also says the international fee, or
the difference, is covered or waived. `detail --format plain` then prints a `CHECK FEES`
line. Read the advert's funding section to confirm. The `fundingFor` field ("UK Students",
"International Students") is set by the site, so it is the more reliable signal of who the
funding is open to.

These are **hints for ranking, not a verdict**. Read the advert's funding and eligibility
sections before telling the user a place is funded or that they are eligible.

## Usage examples

```bash
# Newest funded PhDs open to international students
bun run .agents/skills/jobs-ac-uk-search/cli/src/cli.ts search --format table

# Health and medical PhDs about clinical topics, closing soonest
bun run .agents/skills/jobs-ac-uk-search/cli/src/cli.ts search -q "clinical" --discipline health-and-medical --sort closing --format table

# Machine-learning PhDs in computer science
bun run .agents/skills/jobs-ac-uk-search/cli/src/cli.ts search -q "machine learning" --discipline computer-sciences --format plain

# MRes/MPhil and other master's studentships, any funding
bun run .agents/skills/jobs-ac-uk-search/cli/src/cli.ts search --type masters --funding any --format table

# Full advert with funding and home-fee hints
bun run .agents/skills/jobs-ac-uk-search/cli/src/cli.ts detail DTS352 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default. Used by `/scrape`. |
| `table` | Quick comparisons, with the closing date |
| `plain` | Reading results, or a single advert with `detail` |

JSON search output is `{ "meta": { "count", "page", "pagesScanned", "total" }, "results": [...] }`.
`total` is the number of matching adverts on jobs.ac.uk (summed over both types for `--type
any`). Each result has these fields:
- `id`, `title`, `url`;
- `company` (the institution) and `department`;
- `location` (the city) and `country`, which is `null` in search results; `detail` gives it;
- `date` (posted) and `deadline`;
- `salary` (the advert's stipend text).

Field names match `euraxess-search` where they mean the same thing. Dates are `YYYY-MM-DD`.
Search cards show day and month only, so the year is inferred: placed dates are never in the
future, and closing dates are on or after the placed date. Errors go to stderr as
`{ "error", "code" }` and the CLI exits with code 1. The codes are `BAD_ARG`,
`UNKNOWN_FLAG`, `SEARCH_FAILED`, `BAD_ID`, `NOT_FOUND`, `PARSE_FAILED` and `DETAIL_FAILED`.
`PARSE_FAILED` from `search` means a results page had no readable adverts and no count of
0: the site may be showing a holding page, or its layout may have changed. It never means
"no studentships".

## Notes

- jobs.ac.uk lists **no Australian or New Zealand studentships**, only AU/NZ staff jobs (checked 2026-11-19). Use other sources for AU/NZ.
- UKRI-funded studentships may take international students, usually capped at about 30% of a programme's places. Universities often advertise these as open to all.
- jobs.ac.uk was offline in late November 2026 for a security incident. While it is down, the CLI exits with `SEARCH_FAILED` or `DETAIL_FAILED`. It retries once, then gives up.
- Advert text is employer HTML. It is run through the hidden-markup and invisible-character filters before output.
- Endpoint notes, facet values and parsing anchors are in `url-reference.md`.
