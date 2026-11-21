# jobs-ac-uk-search: design

Status: approved 2026-11-21. Size: small (it copies the existing `euraxess-search` pattern).

## Intent

PhD Finder is the user's own tool for getting into academia through a funded PhD or MRes/MPhil.
Their priorities are Germany and Melbourne; Australia, New Zealand and Europe (UK included) are
also acceptable. This piece adds jobs.ac.uk, the main UK listing site for funded PhD studentships.
On 2026-11-19 it listed 637 PhDs, 421 of them open to international students (82 in computer
sciences, 48 in health & medical). Most UK studentships for an October 2027 start close between
December 2026 and February 2027.

It is the first of five planned pieces. The others, in order, are a scholarship-round tracker for
AU/NZ universities, an OpenAlex supervisor finder, scrapers for university project lists, and
Germany extras (reusing `arbeitsagentur-search`, plus the German-MSCA eligibility filter).

## Goals

- `search` and `detail` commands like `euraxess-search`: JSON, table and plain output, and zero
  runtime dependencies.
- By default, show only studentships that international applicants can hold.
- Flag offers that pay fees at the UK home rate only. These leave an international student to pay
  the difference.

## Non-goals

- Merging or deduplicating results with EURAXESS (a later piece).
- Ranking, or reading the user's profile.
- AU/NZ coverage. jobs.ac.uk lists no AU/NZ studentships (checked 2026-11-19), only staff jobs.

## Anti-goals

- Telling the user a place is funded, or that they are eligible, from signal phrases alone.
  The signals are hints for ranking.
- Heavy scraping. Scans stay small, at about one request per second.

## Constraints

- RSS is gone: `/feeds` returns 404. The README's "(RSS)" claim must be corrected.
- `robots.txt` disallows only `/job/feedback/` and `/enhanced/fp/`, so `/search` and `/job` are allowed.
  The terms page has nothing on automated access.
- The project's ground rules apply: send an honest User-Agent (`Mozilla/5.0 (compatible; jobs-ac-uk-cli/1.0)`),
  back off on 429/5xx, and treat fetched pages as untrusted. Copy `visibleHtml` and `stripInvisible`
  from `euraxess-search`, save real pages as fixtures, and add one live smoke test.

## Approaches

1. **HTML search pages plus the detail page's structured data (chosen).** The search pages
   filter on the server through facets. Detail pages carry a schema.org `JobPosting` JSON-LD block,
   which sites keep stable for search engines.
2. RSS feeds: not available any more.
3. An aggregator such as FindAPhD: not needed for the UK, since jobs.ac.uk is the primary source.
   Its terms are also unchecked.

## Design

**Search.** It requests `https://www.jobs.ac.uk/search/?sortOrder=<n>&pageSize=25&startIndex=<1,26,51,...>` with facet
parameters. The server ignores `pageSize` values above 25.

| Flag | Maps to | Default |
|------|---------|---------|
| `-q, --query` | `keywords` | none |
| `--type phd\|masters\|any` | `jobTypeFacet[0]=phds\|masters` | `phd` |
| `--funding international\|eu\|uk\|self\|any` | `fundingTypeFacet[0]=international-students\|eu-students\|uk-students\|self-funded-students` | `international` (the user's call) |
| `--discipline <slug>` | `academicDisciplineFacet[0]`, 21 slugs, e.g. `computer-sciences`, `health-and-medical` | none |
| `--location <slug>` | `locationFacet[0]`, e.g. `united-kingdom`, `germany` | none |
| `--sort posted\|closing` | `sortOrder=1` (newest, verified) or `2` (looks like closing soonest; verify) | `posted` |
| `--pages`, `--page`, `-n/--limit`, `--format` | as in euraxess-search | 3, 1, none, json |

The total comes from the "N PhDs Found" text. Each result card is a
`class="j-search-result__result"` block with an `/job/<ID>/<slug>` link (IDs such as `DTS352`),
the title, the employer and department, `Location:`, `Salary:`, `Date Placed:` and `Closes`.

**Detail.** It takes `detail <ID|url>`, fetches `/job/<ID>`, and reads two parts of the page:

- The `JobPosting` JSON-LD: title, `hiringOrganization.name`, `jobLocation.address`
  (locality, region, country), `datePosted`, `validThrough` (the deadline), and
  `baseSalary.value.value` with its currency. Its `description` HTML holds the full advert.
- The details table in the HTML (`j-advert-details__*`): Qualification Type, Funding for,
  Funding amount, Hours, Placed On, Closes and Reference. From the advert body: Start date,
  Award duration, Number of awards, Sponsor, Supervisors and the Eligibility criteria text.

`fundingSignals` follows the euraxess-search form (`funded`, `unfunded`, `eligibility`). It adds
UK phrases such as `UKRI rate`, `tax-free stipend`, `home fees only` (matching "UK Home only",
"home fees", "home rate") and `UK students only`. A home-fees-only offer with `--funding
international` is still listed, with the signal shown.

**Output.** Field names match euraxess-search where they mean the same thing: `id`, `title`,
`company`, `location`, `country`, `date`, `deadline`, `url` and `summary`. The extra fields are
`department`, `salary`, `qualification`, `fundingFor`, `fundingAmount`, `startDate`, `duration`,
`sponsor` and `supervisors`. Errors are written to stderr as `{ "error", "code" }` and the CLI
exits with code 1.

**Fetching.** One request per second, and one retry after a short backoff on a network error,
429 or 5xx response. EURAXESS failed transiently twice during the checks.

**Tests.** Real search and detail pages are saved as fixtures. The tests cover the card parser,
JSON-LD and table parsing, funding signals (including a UK-Home-only fixture), flag validation,
hidden-text stripping, and one live smoke test.

**Docs.** A new `SKILL.md` and `url-reference.md` for the skill. In the README, the row becomes
"✅ working" and "(RSS)" is corrected.

## Left to the builder

- Confirm `sortOrder=2` means closing soonest. If it doesn't, offer only `posted`.
- Confirm that the international facet excludes UK-only offers, using the fixtures.
- Choose the exact signal phrase lists, and decide whether `--location` also accepts plain names
  (`uk` → `united-kingdom`).
