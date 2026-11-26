# daad-search: design

Status: approved 2026-11-26. Size: small (follows the `euraxess-search` / `jobs-ac-uk-search` pattern, with a JSON source).

## Intent

PhD Finder is the user's own tool for getting into academia. The user lives in Berlin and has a
part-time work contract with a Berlin company. They want to **enrol in a master's programme**
in Berlin or nearby Brandenburg (Potsdam and others), as a step towards a PhD. Because they stay
in Berlin, the job's income may serve as proof of funds instead of a blocked account.
This skill finds those programmes, limited by default to ones the user can realistically take.

## Goals

- `search` and `detail` commands with the same shape and conventions as the other two skills.
- Defaults that encode "can I take this":
  - master's level;
  - taught in English (the user's German is A2);
  - located in Berlin or a Brandenburg city;
  - no tuition fees.
- `detail` surfaces the admission facts that decide eligibility:
  - the required bachelor's subject;
  - the English certificate and score;
  - any German requirement;
  - application periods and how to apply;
  - semester fee and cost of living;
  - whether it is a combined master's/PhD programme.

## Non-goals

- German-taught programmes, Hochschulkompass, and per-university scrapers (later, only to fill gaps).
- Reading the user's profile automatically, ranking, and merging with the PhD sources.

## Anti-goals

- Deciding admission eligibility. Requirement hints are flags to check, never a verdict.
- Hiding a programme just because DAAD shows a past deadline (DAAD often still shows last year's date).
- Bulk copying of DAAD content: results are fetched to read, not stored.

## Constraints

- `www2.daad.de` has no `robots.txt` (404, checked 2026-11-26). `www.daad.de/robots.txt` sets `Crawl-delay: 2`, so we wait 2 s between requests on www2 too.
- The DAAD imprint says the site content is copyrighted. That is fine for personal search; the tool keeps nothing beyond test fixtures.
- Project ground rules:
  - Honest User-Agent `Mozilla/5.0 (compatible; daad-cli/1.0)`.
  - One retry on network error, 429 or 5xx.
  - Copy the hygiene filters (`visibleHtml`, `stripInvisible`) unchanged.
  - Real pages as fixtures.
  - A live smoke test that skips when the site answers 5xx or not at all.

## Approaches

1. **DAAD International Programmes JSON search plus HTML detail pages (chosen).** The search API returns structured fields (`city`, `languages`, `tuitionFees`, `beginning`, `applicationDeadline`, `subject`, `link`). Detail pages are server-rendered `<dt>/<dd>` lists. On 2026-11-26 there were 177 English-taught master's programmes in Berlin and Brandenburg cities. The trade-off: DAAD lists only internationally oriented programmes, so some English-taught programmes at TU, FU or HU may be missing.
2. Hochschulkompass, or DAAD's "all degree programmes" copy of it: complete, but the site was in maintenance and `www.daad.de/robots.txt` disallows its paging parameter (`hec-fetch-offset`). Deferred.
3. Per-university programme pages: most complete, but one fragile scraper per university. Rejected for now.

## Design

**Search.** It requests `https://www2.daad.de/deutschland/studienangebote/international-programmes/api/solr/en/search.json` with these parameters:

| Parameter | Value |
|-----------|-------|
| `degree[]` | `2` (master's) |
| `lang[]` | `2` (English) |
| `cit[]` | one per city name |
| `q` | the keywords |
| `limit` | `100` |
| `offset` | `0`, `100`, … (paging, verified) |
| `sort` | `4` |
| `display` | `list` |

The response is `{ courses: [...], numResults, filter }`.

| Flag | Meaning | Default |
|------|---------|---------|
| `-q, --query` | keywords | none |
| `--city <list>` | comma-separated city names, sent as `cit[]` | Berlin, Potsdam, Cottbus, Frankfurt (Oder), Eberswalde, Wildau, Senftenberg, Brandenburg an der Havel |
| `--fees free\|any` | `free` keeps courses whose `tuitionFees` is "No tuition fees". It's filtered client-side unless the API's `fee` facet is confirmed to mean the same. | `free` (the user's call) |
| `--start winter\|summer\|any` | client-side match on `beginning` | `any` |
| `--open-only` | drop results whose deadline status is `past` | off |
| `--pages`, `-n/--limit`, `--format json\|table\|plain` | as in the other skills (100 per page) | 2, none, json |

Each result has these fields:
- `id`, `title` (courseName), `company` (academy), `location` (city), `country: "Germany"`, `url` (absolute detail link);
- `languages`, `beginning`, `duration`, `tuitionFees`, `subject`;
- `deadline`: the first ISO date parsed from `applicationDeadline`, or null;
- `deadlineText`: the cleaned `applicationDeadline`;
- `deadlineStatus`: `open` (a date on or after today, or "+ N more" dates), `past`, or `unknown` (no parsable date, including "no deadline" and free text).

**Detail.** It takes `detail <id|url>`, fetches `/deutschland/studienangebote/international-programmes/en/detail/<id>/`, and reads the `<dt>/<dd>` pairs: Degree, Course location, In cooperation with, Teaching language, Programme duration, Beginning, Application periods, Combined Master's degree / PhD programme, Tuition fees per semester, Semester contribution, Costs of living, Academic admission requirements, German language skills, English language skills, Submit application via. The first occurrence of each label wins. Each value is cleaned text.

`requirementSignals` (hints, not a verdict):
- `bachelorSubject`: the subject phrase after "Bachelor's degree in" (e.g. "Computer Science or a related subject").
- `englishCertificate`: true when the English section asks for a certificate. Also extracts `IELTS` and `TOEFL` scores when present.
- `englishLevel`: CEFR level (B2/C1/C2) found in the English section.
- `germanRequired`: false when the section says "No minimum language level required", otherwise the level found.
- `uniAssist`: true when "uni-assist" appears in the application text.
- `combinedPhd`: from the Combined Master's/PhD field.

**Output, errors, fetching** are as in jobs-ac-uk-search:
- Errors are `{ "error", "code" }` on stderr with exit 1. The codes are `BAD_ARG`, `UNKNOWN_FLAG`, `SEARCH_FAILED`, `PARSE_FAILED`, `BAD_ID`, `NOT_FOUND` and `DETAIL_FAILED`.
- A search response that isn't JSON, or that has no `courses` array, is `PARSE_FAILED`.
- Delay comes from `DAAD_DELAY_MS` (default 2000; tests set 0). There is one retry.

**Docs.** `SKILL.md` and `url-reference.md`, plus the README row (`daad-search` → ✅ working). `SKILL.md` carries the visa notes from 2026-11-26:
- Moving from the §20 permit to a §16b student permit.
- Berlin LEA accepts employment income as proof of funds only if it covers its required monthly amount; otherwise a blocked account or similar proof is needed. Check LEA's current figure.
- §16b students may work at most 140 full days per year.

## Left to the builder

- Check whether the API's `fee` facet means "no tuition fees". If it does, send it on the server instead of filtering on the client.
- Choose the exact text patterns for `requirementSignals` and the deadline date parser. It must handle "Register by 1 June 2027 + 1 more", HTML paragraphs, and "This programme has no deadline."
