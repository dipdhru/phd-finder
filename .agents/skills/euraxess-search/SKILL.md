---
name: euraxess-search
version: 1.0.0
description: >
  Use this skill whenever the user wants PhD positions, doctoral candidate (DC) posts,
  funded PhD or doctoral studentships, Marie Skłodowska-Curie (MSCA) Doctoral Network
  positions, master's-level research positions, or postdoc and early-career research
  jobs in Germany, Europe or worldwide, or a posting on euraxess.ec.europa.eu. EURAXESS
  is the European Commission's research-jobs portal, which universities and institutes
  across Europe post to directly. Trigger phrases: PhD positions, funded PhD, PhD in
  Germany, doctoral position, doctoral candidate, MSCA, Marie Curie, doctoral network,
  research position, early-stage researcher, first stage researcher R1, postdoc Europe,
  EURAXESS, Promotionsstelle, Doktorandenstelle, Doktorand/in, wissenschaftliche/r
  Mitarbeiter/in Promotion, Promotion, Graduiertenkolleg.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/euraxess-search/cli/src/cli.ts *)
---

# EURAXESS Search Skill

Searches [EURAXESS](https://euraxess.ec.europa.eu/jobs/search), the European Commission's
portal for research jobs. It has no public API, so the CLI reads the public HTML search and
detail pages. No key is needed, and `robots.txt` allows `/jobs`. It is a public service:
keep scans small (the default is 3 pages of 10 offers).

**Default level is PhD.** Unless you pass `--level`, the search covers only offers
tagged *PhD Positions*. Use `--level master` for master's-level research posts (the closest
EURAXESS has to MRes/MPhil places), `--level postdoc`, or `--level any`.

All filters except `--location` and `--jobage` are applied by the EURAXESS server, so a
search covers every open offer, not only recent ones.

## Commands

### Search

```bash
bun run .agents/skills/euraxess-search/cli/src/cli.ts search [flags]
```

- `--query`/`-q <text>`: keywords. Every word must appear somewhere in the offer (title, description or fields).
- `--level phd|master|postdoc|bachelor|undergraduate|research-support|other|any`: position type. Default `phd`.
- `--country`/`-c <list>`: comma-separated country names, e.g. `germany,netherlands,uk`. Several countries are OR-ed.
- `--profile r1,r2,r3,r4`: researcher profile. `r1` (First Stage Researcher) is the doctoral level.
- `--programme msca,cofund,erc,eic,horizon,none`: EU funding programme. `msca` finds Marie Skłodowska-Curie Doctoral Networks; `none` is "Not funded by an EU programme" (often nationally funded or salaried).
- `--location`/`-l <text>`: a substring of the work location (city or institute), checked by the CLI. Umlauts are folded and Munich/München, Cologne/Köln match.
- `--jobage <days>`: posted within N days (1-90).
- `--sort posted|deadline`: newest first (default) or closing soonest.
- `--pages <n>`: pages to scan (1-10, default 3). `--page <n>`: first page (default 1).
- `--limit`/`-n <n>`, `--format json|table|plain`.

### Detail

```bash
bun run .agents/skills/euraxess-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

Returns the full offer: organisation, positions, contract type, hours, start date, EU
programme and MSCA grant number, the full description, requirements and additional
information, and the employer's application link (`applyUrl`).

## Funding and eligibility hints

`detail` adds `fundingSignals`, phrases found in the offer text:

- `funded`: e.g. `MSCA`, `stipend`, `studentship`, `scholarship`, `salary`, `German public pay scale (TV-L/TVöD)`, `E13 pay grade`, `living allowance`, `tuition covered`.
- `unfunded`: e.g. `self-funded`, `own funding required`, `tuition fees apply`.
- `eligibility`: e.g. `MSCA mobility rule`, `home-fee status`, `nationality restriction`, `any nationality`, `must not hold a PhD`.

These are **hints for ranking, not a verdict**. Read the offer before telling the user a
position is funded or that they are eligible. The MSCA mobility rule matters most: an
applicant who lived or worked in the host country for more than 12 of the last 36 months is
usually ineligible.

## Usage examples

```bash
# PhD positions in Germany, newest first
bun run .agents/skills/euraxess-search/cli/src/cli.ts search -c germany --format table

# Funded MSCA doctoral network posts in geoscience anywhere, closing soonest
bun run .agents/skills/euraxess-search/cli/src/cli.ts search -q geophysics --programme msca --sort deadline --format table

# Machine-learning PhDs in Germany or the Netherlands posted in the last 30 days
bun run .agents/skills/euraxess-search/cli/src/cli.ts search -q "machine learning" -c germany,netherlands --jobage 30 --format table

# PhD positions in Munich (city filter runs over the Germany results)
bun run .agents/skills/euraxess-search/cli/src/cli.ts search -c germany -l München --pages 5 --format table

# Master's-level research positions (closest match to MRes/MPhil) in the UK and Ireland
bun run .agents/skills/euraxess-search/cli/src/cli.ts search --level master -c uk,ireland --format table

# Full offer with funding hints
bun run .agents/skills/euraxess-search/cli/src/cli.ts detail 479677 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default. Used by `/scrape`. |
| `table` | Quick comparisons, including the deadline |
| `plain` | Reading results or a single offer with `detail` |

JSON search output is `{ "meta": { "count", "page", "pagesScanned", "total" }, "results": [...] }`.
`total` is the number of matching offers on EURAXESS. Each result has `id`, `title`, `company`
(the organisation), `location`, `country`, `date` (posted), `deadline`, `url`, `offers`
(number of positions), `researchFields`, `profiles`, `fundingProgramme` and `summary`. Dates
are `YYYY-MM-DD`; the deadline is the date in the poster's own time zone. Errors go to stderr as
`{ "error", "code" }` and the CLI exits with code 1.

## Notes

- Most offers are in Europe, but EURAXESS also lists posts in North America, Asia and elsewhere (`-c usa,japan`, ...). `-c europe` matches offers tagged with Europe as a region, not every European country.
- The *PhD Positions* tag is set by the poster. A few offers are tagged with several position types, so a PhD search can include a postdoc post. Check `profiles` (R1 = doctoral).
- German PhD posts are often employment contracts (*wissenschaftliche/r Mitarbeiter/in*, TV-L E13, often 50-75 %), not stipends. They may also appear on the Arbeitsagentur board; deduplicate by title and organisation.
- Offer text is employer HTML. It is run through the hidden-markup and invisible-character filters before output. Detail pages carry a hidden `STATUS: EXPIRED` template, which the filter drops.
- Endpoint notes and filter ids are in `url-reference.md`.
