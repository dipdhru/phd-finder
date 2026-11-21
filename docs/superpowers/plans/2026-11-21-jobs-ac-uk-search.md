# jobs-ac-uk-search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `jobs-ac-uk-search` agent skill: a Bun CLI with `search` and `detail` commands for funded UK PhD and MRes/MPhil studentships on jobs.ac.uk, filtered by default to places that international students can hold, and flagging fees paid at the UK home rate only.

**Architecture:** This follows `.agents/skills/euraxess-search/cli`. `search` reads the server-rendered search pages, which hold 25 cards each and filter on the server through facet parameters. `detail` reads the advert's schema.org `JobPosting` JSON-LD, the details table, and labelled paragraphs inside the advert HTML. Output passes through the same hygiene filters (`visibleHtml`, `stripInvisible`) before it reaches stdout.

**Tech Stack:** Bun and TypeScript, with zero runtime dependencies. The dev dependencies are `typescript ^5.4.0` and `@types/bun 1.3.14`, copied from euraxess `package.json`. Tests use `bun test`.

**Spec:** `docs/superpowers/specs/2026-11-21-jobs-ac-uk-search-design.md`

**Branch:** `feature/jobs-ac-uk-search` (already created, with the spec committed).

## Global Constraints

- Zero runtime dependencies. `package.json` `"dependencies": {}`.
- User-Agent is exactly `Mozilla/5.0 (compatible; jobs-ac-uk-cli/1.0)`.
- Wait about 1 second between requests in a scan. Retry once after a short backoff on a network error (fetch throws, including timeouts), a 429, or a 5xx. A 404 returns `null`.
- The delay and backoff come from env `JOBS_AC_UK_DELAY_MS` (default `1000`). The backoff adds jitter of up to 500 ms, scaled to 0 when the env value is `0`. Tests set it to `0`.
- Errors go to stderr as one line of `{"error","code"}`, the exit code is 1, and nothing is written to stdout.
- Every result passes through `stripInvisible` just before output. `visibleHtml`, `stripInvisible`, `decodeHtmlEntities`, `clean` and `cleanMultiline` are copied **unchanged** from `euraxess-search/cli/src/helpers.ts`.
- Unknown flags exit 1 with `UNKNOWN_FLAG`. Bad values exit 1 with `BAD_ARG`.
- The base URL is `https://www.jobs.ac.uk`. Cards link to `/job/<ID>/<slug>`, and IDs look like `DTS352`, matching `/^[A-Z]{2,4}\d{2,5}$/`. Canonical result URLs are `https://www.jobs.ac.uk/job/<ID>`.
- Funding signals are hints for ranking, never a verdict, and the docs must say so.
- Test command: `bun test --timeout 30000`, run from `.agents/skills/jobs-ac-uk-search/cli`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Year rollover on card dates.** Cards show `20 Nov` and `24 Mar` with no year. A card placed `20 Dec` that closes `09 Jan` must read as a deadline in the next year, and a placed date is never in the future. Test: Task 2.
2. **Detail page with no JobPosting data.** A changed layout or a withdrawn advert can return a 200 page without the data. It must exit 1 with `PARSE_FAILED`, distinct from a 404 `NOT_FOUND`, and must not crash or print half a record. Test: Task 4.
3. **Several or broken JSON-LD blocks.** Pages may carry a `BreadcrumbList` block or one that isn't valid JSON next to the `JobPosting`. The parser must skip those and use the `JobPosting`. Test: Task 4.
4. **Paging edges.** After the reported total, or after a page with fewer than 25 cards, no further request goes out. A card that appears on two pages (new adverts shift the list during a scan) is output once. Test: Task 3.
5. **Failure mid-scan after the retry.** The command exits 1 with `SEARCH_FAILED` on stderr and an empty stdout. It never writes partial JSON. Test: Task 3.

---

## File Structure

All paths below are under `.agents/skills/jobs-ac-uk-search/`.

| File | Responsibility |
|------|----------------|
| `SKILL.md` | The agent-facing skill: triggers, commands, funding caveats |
| `url-reference.md` | Endpoints, facet values and parsing anchors, verified 2026-11-21 |
| `cli/package.json`, `cli/tsconfig.json`, `cli/README.md` | Copied from euraxess, with the names changed |
| `cli/src/helpers.ts` | `BASE`, `writeError`, `htmlFetch` (pacing and retry), `sleep`, and the copied hygiene functions |
| `cli/src/facets.ts` | Flag-to-facet tables and `searchUrl` |
| `cli/src/parse-search.ts` | `JobCard`, `inferDate`, `parseSearchPage` |
| `cli/src/parse-detail.ts` | `JobDetail`, `FundingSignals`, `fundingSignals`, `parseUkDate`, `parseDetail` |
| `cli/src/commands/search.ts`, `cli/src/commands/detail.ts` | Run a command and render json, table or plain output |
| `cli/src/cli.ts` | Flag parsing and validation, help text, dispatch |
| `cli/tests/helpers.ts` | `runCLI` and `runWithServer` (origin `https://www.jobs.ac.uk`, env delay `0`), `fixture`, `parseJSON`, `FIXTURE_DATE` |
| `cli/tests/fetch.test.ts`, `parse-search.test.ts`, `search-cli.test.ts`, `detail.test.ts`, `hidden-text.test.ts`, `live-smoke.test.ts` | Tests |
| `cli/tests/fixtures/search.html`, `cli/tests/fixtures/detail-uk-home.html` | Real pages |

The root `README.md` is modified to update the Sources table row.

---

### Task 1: Scaffold, fetcher and fixtures

**Files:**
- Create: `cli/package.json`, `cli/tsconfig.json`, `cli/src/helpers.ts`, `cli/tests/helpers.ts`, `cli/tests/fetch.test.ts`, `cli/tests/fixtures/search.html`, `cli/tests/fixtures/detail-uk-home.html`

**Interfaces:**
- Produces:
  - `BASE = "https://www.jobs.ac.uk"`
  - `writeError(error: string, code: string): void`
  - `sleep(ms: number): Promise<void>`
  - `delayMs(): number`, which reads `JOBS_AC_UK_DELAY_MS` (default 1000; an invalid value falls back to 1000)
  - `htmlFetch(url: string): Promise<string | null>`
  - The copied `decodeHtmlEntities`, `stripInvisible`, `visibleHtml`, `clean`, `cleanMultiline`
  - Test side: `runCLI(args)` and `runWithServer(args, respond)` with euraxess's shapes, `fixture(name)`, `parseJSON(result)`, and `FIXTURE_DATE: Date`

- [ ] **Step 1: Create the package files.** Copy `package.json` and `tsconfig.json` from `euraxess-search/cli`. Set `name` to `jobs-ac-uk-cli` and `bin` to `{"jobs-ac-uk-search": "src/cli.ts"}`, and write a one-line description of UK studentships. Run `bun install`. Expected: `node_modules/` appears. The root `.gitignore` already ignores `node_modules` and `bun.lock`.

- [ ] **Step 2: Save the fixtures.** Run from `cli/`:

```bash
UA='Mozilla/5.0 (compatible; jobs-ac-uk-cli/1.0)'
curl -sS -A "$UA" -o tests/fixtures/search.html 'https://www.jobs.ac.uk/search/?sortOrder=1&pageSize=25&startIndex=1&jobTypeFacet%5B0%5D=phds&fundingTypeFacet%5B0%5D=international-students'
sleep 1
curl -sSL -A "$UA" -o tests/fixtures/detail-uk-home.html 'https://www.jobs.ac.uk/job/DTS352'
grep -c 'j-search-result__result' tests/fixtures/search.html   # expect 25
grep -c 'UK Home only' tests/fixtures/detail-uk-home.html       # expect >= 1
```

If DTS352 has been withdrawn, choose another advert that says "UK Home students only" and change the expected values in Task 4 to match it. Set `FIXTURE_DATE` in `tests/helpers.ts` to the day the fixtures were saved.

- [ ] **Step 3: Write `tests/helpers.ts`.** Adapt euraxess `tests/helpers.ts`:
  - The preload passes only `https://www.jobs.ac.uk` and throws on any other origin.
  - `runCLI` spawns with `env: { ...process.env, JOBS_AC_UK_DELAY_MS: "0" }`.

- [ ] **Step 4: Write the failing tests in `tests/fetch.test.ts`.** They call `htmlFetch` in-process with `globalThis.fetch` replaced, and set `process.env.JOBS_AC_UK_DELAY_MS = "0"` in `beforeAll`.

```ts
test("retries once after a network error, then succeeds")    // fetch throws TypeError once, then 200 "ok" → returns "ok", 2 calls
test("retries once after 503, then succeeds")                // 503 then 200 → "ok", 2 calls
test("gives up after the second failure")                    // 503, 503 → rejects with /503/, exactly 2 calls
test("returns null on 404 without retrying")                 // 404 → null, 1 call
test("sends the honest User-Agent")                          // headers["User-Agent"] === "Mozilla/5.0 (compatible; jobs-ac-uk-cli/1.0)"
```

- [ ] **Step 5: Run the tests to see them fail.** Run `bun test tests/fetch.test.ts`. Expected: FAIL, because `helpers.ts` is not found.

- [ ] **Step 6: Implement `src/helpers.ts`.**
  - The hygiene block is copied verbatim, with its comment noting where it came from.
  - `htmlFetch` makes at most 2 attempts. Before the second, it sleeps `delayMs() + jitter`, where `jitter = delayMs() ? random(0..500) : 0`.
  - It sends `AbortSignal.timeout(20000)` and `Accept: text/html`.
  - A non-OK status other than 404, 429 or 5xx throws immediately with no retry.

- [ ] **Step 7: Run the tests to see them pass.** Run `bun test tests/fetch.test.ts && bunx tsc --noEmit`. Expected: 5 pass, and no type errors.

- [ ] **Step 8: Commit.**

```bash
git add .agents/skills/jobs-ac-uk-search/cli
git commit -m "Add jobs-ac-uk-search scaffold, paced fetcher with retry, and fixtures

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Search-page parsing

**Files:**
- Create: `cli/src/parse-search.ts`, `cli/tests/parse-search.test.ts`

**Interfaces:**
- Consumes: `BASE`, `clean`, and `decodeHtmlEntities` from `helpers.ts`.
- Produces:
  ```ts
  export interface JobCard {
    id: string; title: string; company: string | null; department: string | null
    location: string | null; country: null; date: string | null; deadline: string | null
    url: string; salary: string | null
  }
  export function inferDate(dayMonth: string, ref: Date, direction: "past" | "future"): string | null
  export function parseSearchPage(html: string, today: Date): { cards: JobCard[]; total: number | null }
  ```

**Parsing anchors** (from the live page, 2026-11-21):
- Cards: split on `class="j-search-result__result`.
- Inside a card:
  - `id`: the first `href="/job/<ID>/`.
  - `title`: the text of that `<a>`.
  - `department`: `j-search-result__department`, or null when empty.
  - `company`: the `<b>` inside `j-search-result__employer`.
  - `location`: the text after `Location:` up to `</div>`.
  - `salary`: the text after `<strong>Salary: </strong>` up to `</div>`, or null for "Not Specified" or empty.
  - Placed date: after `Date Placed: </strong>`.
  - Closing date: the span with class `j-search-result__date--blue`.
- Total: the integer in `<strong class="job-count">N</strong>`.

**Rules:**
- `country` is always `null` on cards, because cards show a city only. Detail fills it in.
- `date = inferDate(placed, today, "past")`.
- `deadline = inferDate(closes, dateOrToday, "future")`.
- `"future"` allows the same day.
- Text that `inferDate` can't parse gives `null`.

- [ ] **Step 1: Write the failing tests.**

```ts
test("inferDate: placed date rolls back a year rather than land in the future")
  // expect(inferDate("20 Dec", new Date("2027-01-05"), "past")).toBe("2026-12-20")
test("inferDate: closing date rolls forward over New Year")
  // expect(inferDate("09 Jan", new Date("2026-12-20"), "future")).toBe("2027-01-09")
test("inferDate: same day counts for both directions")
  // inferDate("21 Nov", new Date("2026-11-21"), "past") === "2026-11-21"; same with "future"
test("inferDate: rejects bad input")
  // inferDate("31 Feb", ref, "past") === null; inferDate("soon", ref, "future") === null
test("parseSearchPage reads every card of the real fixture")
  // cards.length === 25; total is an integer >= 25
  // every card: id matches /^[A-Z]{2,4}\d{2,5}$/, url === `https://www.jobs.ac.uk/job/${id}`,
  //   title and company non-empty, country === null, date matches /^\d{4}-\d{2}-\d{2}$/ and
  //   date <= FIXTURE_DATE iso, deadline === null || deadline >= date
test("a card without a Closes span has deadline null")
  // remove the first `j-search-result__date--blue` span from the fixture → cards[0].deadline === null
test("a page with no cards gives an empty list and its total")
  // `<strong class="job-count">0</strong>` and no cards → { cards: [], total: 0 }
```

- [ ] **Step 2: Run the tests to see them fail.** Run `bun test tests/parse-search.test.ts`. Expected: FAIL, because the module is not found.

- [ ] **Step 3: Implement `src/parse-search.ts`** using the anchors and rules above. Month names are the 3-letter English abbreviations. Validate that the day really exists in that month, so 31 Feb returns null.

- [ ] **Step 4: Run the tests to see them pass.** Run `bun test tests/parse-search.test.ts && bunx tsc --noEmit`. Expected: 7 pass.

- [ ] **Step 5: Commit** with message `Parse jobs.ac.uk search result cards` and the Co-Authored-By trailer.

---

### Task 3: Search command and CLI flags

**Files:**
- Create: `cli/src/facets.ts`, `cli/src/commands/search.ts`, `cli/src/cli.ts`, `cli/tests/search-cli.test.ts`

**Interfaces:**
- Consumes: `htmlFetch`, `sleep`, `delayMs`, `stripInvisible`, `writeError` (Task 1), and `parseSearchPage` and `JobCard` (Task 2).
- Produces:
  ```ts
  // facets.ts
  export const TYPES: Record<"phd" | "masters" | "any", string[]>   // phd→["phds"], masters→["masters"], any→["phds","masters"]
  export const FUNDING: Record<string, string | null>                // international→"international-students", eu→"eu-students",
                                                                     // uk→"uk-students", self→"self-funded-students", any→null
  export const DISCIPLINES: string[]   // the 21 slugs in url-reference.md, e.g. "computer-sciences", "health-and-medical"
  export const LOCATION_ALIASES: Record<string, string>              // uk/"united kingdom"/britain→"united-kingdom", deutschland→"germany"
  export const SORTS: Record<"posted" | "closing", number>           // posted→1, closing→2
  export interface SearchParams { query?: string; types: string[]; funding: string | null; discipline?: string; location?: string; sort: "posted" | "closing" }
  export function locationSlug(input: string): string                // alias, else lowercase, spaces→"-", strip [^a-z-]
  export function searchUrl(p: SearchParams, startIndex: number): string
  // commands/search.ts
  export interface SearchOpts extends SearchParams { page: number; pages: number; limit?: number; format: "json" | "table" | "plain" }
  export function runSearch(opts: SearchOpts): Promise<number>
  ```
- `searchUrl` emits these parameters in this order:
  - `sortOrder`
  - `pageSize=25`
  - `startIndex`
  - `keywords`, when a query is given
  - `jobTypeFacet[i]`
  - `fundingTypeFacet[0]`, unless funding is null
  - `academicDisciplineFacet[0]`
  - `locationFacet[0]`
- `startIndex` for page n (1-indexed) is `(n - 1) * 25 + 1`.
- JSON output is `{ meta: { count, page, pagesScanned, total }, results }`, the same shape as euraxess.

- [ ] **Step 1: Verify two behaviours on the live site before coding.**
  - `sortOrder=2`: with the Step-2 fixture query, fetch `sortOrder=2` and check that the `Closes` dates on page 1 ascend. If they don't, remove `closing` from `SORTS`, from the help text and from the spec table.
  - `--type any`: fetch with `jobTypeFacet%5B0%5D=phds&jobTypeFacet%5B1%5D=masters` and check that `job-count` is about the PhD count plus the masters count, meaning the facets are OR-ed. If instead it's the intersection or an error, implement `any` in `runSearch` as two scans, PhD first then masters, merged and deduplicated by id.
  - International facet: page through the international-funding results, newest first, until the placed dates pass the fixture advert's (19 Nov for DTS352). Confirm that the UK-Home-only fixture advert never appears. If it does appear, the facet is not exclusive: say so in `SKILL.md` and rely on the `home fees only` / `UK students only` signals.
  - Record all three outcomes for `url-reference.md` in Task 5.

- [ ] **Step 2: Write the failing tests.** Use `runWithServer`, answering with `fixture("search.html")` unless noted.

```ts
test("defaults: PhD, international funding, newest first, first 25")
  // one request per page; requests[0] search params ===
  // { sortOrder:"1", pageSize:"25", startIndex:"1", "jobTypeFacet[0]":"phds", "fundingTypeFacet[0]":"international-students" }
test("flags map to facets")
  // ["search","-q","clinical nlp","--type","masters","--funding","any","--discipline","health-and-medical","--location","UK","--sort","closing","--pages","1"]
  // → keywords:"clinical nlp", jobTypeFacet[0]:"masters", no fundingTypeFacet, academicDisciplineFacet[0]:"health-and-medical",
  //   locationFacet[0]:"united-kingdom", sortOrder:"2"
test("--pages 3 asks for startIndex 1, 26, 51 and outputs a repeated card once")
  // the same fixture on every page → 3 requests; meta.pagesScanned === 3; results.length === 25
test("stops paging at the reported total")
  // the fixture with job-count changed to 30 and --pages 5 → exactly 2 requests
test("stops after a short page")
  // the second response has only its first 3 cards → no third request
test("--limit caps output and stops scanning")
  // --limit 5 --pages 3 → results.length === 5 and 1 request
test("503 then 200 succeeds via the retry")                     // exit 0, 2 requests
test("persistent failure exits 1 with SEARCH_FAILED and empty stdout")
  // always 503 → exitCode 1, stdout === "", JSON.parse(stderr).code === "SEARCH_FAILED"
test("table and plain formats render the first card's id and title")
for bad of [["--pages","11"],["--page","0"],["--type","professor"],["--funding","rich"],
            ["--discipline","astrology"],["--sort","random"],["--location",""],["--format","xml"],["-q",""]]
  test(`${bad} exits 1 with BAD_ARG`)
test("euraxess-only flag --country is rejected with UNKNOWN_FLAG")
```

- [ ] **Step 3: Run the tests to see them fail.** Run `bun test tests/search-cli.test.ts`. Expected: FAIL, because `cli.ts` is not found.

- [ ] **Step 4: Implement `facets.ts`, `commands/search.ts` and the search half of `cli.ts`.**
  - Reuse euraxess `parseFlags`, `intFlag` and the `KNOWN_FLAGS` pattern.
  - Search flags: `query location type funding discipline sort pages page limit format help h`, with aliases `q`, `n`, `l`.
  - Limits: `--pages` is 1–10 (default 3). `--page` is 1–1000. `--limit` is 1–10000.
  - `runSearch` sleeps `delayMs()` between page requests, not before the first.
  - Paging stops when a page has fewer than 25 cards, or when `page * 25 >= total`, or when the limit is reached.
  - It builds the full results array before writing anything.
  - Table columns: ID, TITLE (48), ORGANISATION (28), LOCATION (16), POSTED, CLOSES.
  - Plain output per card: title; then `company · location`; then `posted … · closes … · salary`; then `id`; then the URL.
  - The help text explains each flag, and notes that `--funding` defaults to `international` and why.

- [ ] **Step 5: Run the tests to see them pass.** Run `bun test tests/search-cli.test.ts && bunx tsc --noEmit`. Expected: all pass.

- [ ] **Step 6: Commit** with message `Add jobs.ac.uk search command with funding, type and discipline filters` and the trailer.

---

### Task 4: Detail parsing and command

**Files:**
- Create: `cli/src/parse-detail.ts`, `cli/src/commands/detail.ts`, `cli/tests/detail.test.ts`
- Modify: `cli/src/cli.ts`, to add the `detail` command

**Interfaces:**
- Consumes: `htmlFetch`, `clean`, `cleanMultiline`, `stripInvisible`, `writeError`, `BASE` (Task 1), and `JobCard` (Task 2).
- Produces:
  ```ts
  export interface FundingSignals { funded: string[]; unfunded: string[]; eligibility: string[] }
  export interface JobDetail extends Omit<JobCard, "salary" | "department" | "country"> {
    country: string | null; qualification: string | null; fundingFor: string[]; fundingAmount: string | null
    hours: string | null; reference: string | null; startDate: string | null; duration: string | null
    sponsor: string | null; supervisors: string[]; eligibility: string | null; applyUrl: string | null
    description: string | null; fundingSignals: FundingSignals
  }
  export function fundingSignals(text: string): FundingSignals
  export function parseUkDate(text: string | null): string | null   // "19th November 2026", "1 st October 2027", "27 January 2027" → ISO
  export function parseDetail(html: string, id: string): JobDetail | null   // null when no JobPosting JSON-LD
  // commands/detail.ts
  export function normalizeId(input: string): string | null
  export function runDetail(opts: { id: string; format: "json" | "plain" }): Promise<number>
  ```

**Where each field comes from:**

- **JSON-LD:** every `<script type="application/ld+json">` block is parsed in a try/catch, and the first whose `@type` is `"JobPosting"` is used. From it:
  - `title`, `company` (`hiringOrganization.name`)
  - `location`: `addressLocality, addressRegion`, joined with ", "
  - `country` (`addressCountry`)
  - `date`: `datePosted.slice(0, 10)`
  - `deadline`: `validThrough.slice(0, 10)`
  - `description`: `cleanMultiline(description)`
- **Details table:** each `<th class="j-advert-details__table-header">Label:</th>` with its `<td>`. This gives `qualification` (Qualification Type), `fundingFor` (Funding for, split on `,`), `fundingAmount`, `hours`, and `reference`. When JSON-LD lacks the dates, use `Placed On` and `Closes` through `parseUkDate`.
- **Labelled paragraphs** in the JSON-LD `description` HTML: `<strong>Label:?</strong> value</p>`, with labels matched case-insensitively and a trailing colon or nbsp ignored. This gives `startDate` (Start date, through `parseUkDate`), `duration` (Award duration), and `sponsor`.
- **Heading sections:** a heading is a `<p>` whose whole content is one `<strong>` of 40 characters or fewer that doesn't end in ".". `supervisors` is the cleaned text of each `<p>` after the "Supervisors" heading, up to the next heading. `eligibility` is the joined text of the `<p>`s after the "Eligibility criteria" heading, up to the next heading.
- **`applyUrl`:** the `href` of the `<a>` that wraps `id="job-apply-button"`. Keep it only if it matches `^https?://[^\s"'<>]+$`.
- **`fundingSignals`:** run over title, description, fundingFor and fundingAmount.
  - Copy euraxess's FUNDED, UNFUNDED and ELIGIBILITY rules.
  - Add to FUNDED: `/\bUKRI\b[^.]{0,40}\brate\b/i` labelled `"UKRI rate"`, and `/\btax[- ]free\b[^.]{0,30}\b(stipend|allowance|maintenance)\b/i` labelled `"tax-free stipend"`.
  - Add to ELIGIBILITY: `/\bUK Home only\b|\bhome (fees?|rate)\b|\bfees at the (UK )?home rate\b/i` labelled `"home fees only"`. Also add `/\bUK (Home )?students only\b/i` labelled `"UK students only"`, and `/\binternational (students|applicants)\b[^.]{0,30}\b(eligible|welcome|may apply|can apply)\b/i` labelled `"international students eligible"`.
- **`normalizeId`:**
  - Accepts a bare ID, case-insensitive and returned uppercase.
  - Accepts `https://www.jobs.ac.uk/job/<ID>[/<slug>]`, and the same without the scheme or `www`.
  - The host must match `/^(www\.)?jobs\.ac\.uk$/i`, checked with `new URL`.

- [ ] **Step 1: Write the failing tests.**

```ts
test("parseDetail reads the UK-home-only fixture")
  // const d = parseDetail(await fixture("detail-uk-home.html"), "DTS352")!
  // d.title startsWith "PG Funding: PhD Studentship - Process Industries"; d.company === "Newcastle University"
  // d.location === "Newcastle upon Tyne, England"; d.country === "United Kingdom"
  // d.date === "2026-11-19"; d.deadline === "2027-01-27"; d.url === "https://www.jobs.ac.uk/job/DTS352"
  // d.qualification === "PhD"; d.fundingFor toEqual ["UK Students"]; d.fundingAmount === "£21,805 - please see advert"
  // d.hours === "Full Time"; d.reference === "PINZ06-27"; d.startDate === "2027-10-01"; d.duration === "4 years"
  // d.sponsor === "EPSRC"; d.supervisors toEqual ["Dr. Othman Al Musaimi (Othman.Almusaimi@newcastle.ac.uk)"]
  // d.eligibility contains "minimum 2:1 Honours degree"; d.applyUrl startsWith "https://www.ncl.ac.uk/postgraduate/fees-funding/"
  // d.description contains "GLP-1"
  // d.fundingSignals.funded contains "UKRI rate", "tax-free stipend", "living allowance"
  // d.fundingSignals.eligibility contains "home fees only", "UK students only"
test("fundingSignals flags international eligibility and home-rate fees in plain text")
  // fundingSignals("International applicants are eligible. Fees are paid at the home rate.").eligibility
  //   toContain "international students eligible" and "home fees only"
test("parseUkDate handles ordinals and split ordinals")
  // "19th November 2026"→"2026-11-19"; "1 st October 2027"→"2027-10-01"; "sometime"→null
test("skips broken and non-JobPosting JSON-LD blocks")
  // insert before the real block: `<script type="application/ld+json">{not json</script>` and
  // a valid {"@type":"BreadcrumbList"} block → parseDetail still returns title and company
test("no JobPosting data → CLI exits 1 with PARSE_FAILED")
  // runWithServer(["detail","DTS352"], () => html("<html><body>changed</body></html>")) → code "PARSE_FAILED", stdout ""
test("404 → CLI exits 1 with NOT_FOUND")
test("detail requests /job/<ID> and plain format shows the home-fees warning")
  // requests[0].url.pathname === "/job/DTS352"; plain stdout contains "home fees only"
test("normalizeId")
  // "dts352"→"DTS352"; "https://www.jobs.ac.uk/job/DTS352/slug"→"DTS352"; "jobs.ac.uk/job/DTS352"→"DTS352"
  // "https://www.jobs.ac.uk.evil.io/job/DTS352"→null; "https://evil.io/job/DTS352"→null; "12345"→null
test("detail with a bad id exits 1 with BAD_ID")
```

- [ ] **Step 2: Run the tests to see them fail.** Run `bun test tests/detail.test.ts`. Expected: FAIL, because the module is not found.

- [ ] **Step 3: Implement `parse-detail.ts`, `commands/detail.ts` and the detail half of `cli.ts`.**
  - Detail flags: `format help h`.
  - Plain output, in order:
    1. Title, then `company · location`, then a blank line.
    2. `Qualification`, `Funding for`, `Funding amount`.
    3. `Funding hints: …`, with `| warnings: …` added for unfunded hits.
    4. `Eligibility hints: …`, printed on its own line when it includes "home fees only", so it stands out.
    5. Posted, Closes, Starts, Duration, Sponsor, Supervisors.
    6. The description, then the `ELIGIBILITY` section.
    7. `Apply (employer site): …`, then `URL: …`.
    - Empty lines are dropped, as in euraxess.
  - Error codes: `BAD_ID`, `NOT_FOUND` (404), `PARSE_FAILED` (200 with no JobPosting), and `DETAIL_FAILED` (fetch threw).

- [ ] **Step 4: Run the tests to see them pass.** Run `bun test && bunx tsc --noEmit`. Expected: the whole suite passes. Live smoke comes in Task 5.

- [ ] **Step 5: Commit** with message `Add jobs.ac.uk detail command with UK funding and home-fee signals` and the trailer.

---

### Task 5: Hidden-text guard, live smoke test and docs

**Files:**
- Create: `cli/tests/hidden-text.test.ts`, `cli/tests/live-smoke.test.ts`, `cli/README.md`, `SKILL.md`, `url-reference.md`
- Modify: `README.md` (repo root), the Sources row for `jobs-ac-uk-search`

**Interfaces:**
- Consumes: the CLI from Tasks 3–4, and euraxess `tests/hidden-text.test.ts`, whose `TAGGED`, `INVISIBLE`, `HIDDEN` and `INVISIBLE_CHAR` constants are copied.

- [ ] **Step 1: Write the tests.**

```ts
// hidden-text.test.ts
test("search output carries no invisible characters or hidden markup")
  // inject INVISIBLE into the first card title and HIDDEN+INVISIBLE into its employer <b>; for json|plain|table:
  // exit 0, stdout has no INVISIBLE_CHAR match and doesn't contain "HIDDEN"
test("detail output carries no invisible characters or hidden markup")
  // inject `Visible intro.${INVISIBLE}` + HIDDEN + `Visible end.` into the JSON-LD description, JSON-escaped with
  // JSON.stringify(x).slice(1, -1), before "GLP-1 receptor agonists"; for json|plain: no INVISIBLE_CHAR, no "HIDDEN",
  // contains "Visible intro." and "Visible end."
// live-smoke.test.ts (real network)
test("live search and detail return real studentships")
  // search --pages 1 --limit 5 → results.length > 0; each id matches /^[A-Z]{2,4}\d{2,5}$/, url starts
  // "https://www.jobs.ac.uk/job/", date ISO; detail of results[0].id → same id, non-empty title,
  // deadline null or ISO
```

- [ ] **Step 2: Run the tests.** Run `bun test`. Expected: all pass. If the hidden-text tests fail, the fix goes in the output path (calling `stripInvisible` or `clean`), never in the test.

- [ ] **Step 3: Write `SKILL.md`, following the layout of euraxess `SKILL.md`.**
  - Frontmatter:
    - `name: jobs-ac-uk-search`
    - `version: 1.0.0`
    - `context: fork`
    - `enabled: true`
    - `allowed-tools: Bash(bun run .agents/skills/jobs-ac-uk-search/cli/src/cli.ts *)`
  - The description's trigger phrases: UK PhD studentship, funded PhD UK, MRes, MPhil, doctoral training partnership/DTP, CDT, UKRI studentship, studentships for international students, jobs.ac.uk.
  - Body sections:
    - Commands, with every flag and its default.
    - **Funding and eligibility hints.** It must say that `--funding international` keeps offers that pay fees only at the home rate, that `home fees only` means an international student may owe the international fee difference, and that hints are not a verdict.
    - Usage examples. Include `-q "clinical" --discipline health-and-medical`, plus the `masters` type.
    - Output formats.
    - Notes: no AU/NZ studentships (checked 2026-11-19), RSS gone, small scans.

- [ ] **Step 4: Write `url-reference.md` and `cli/README.md`.**
  - `url-reference.md` covers:
    - The search endpoint and parameters.
    - The facet values: the 4 funding values, the 21 discipline slugs from the fixture's `academicDisciplineFacet[]` inputs, and example location slugs.
    - The Task 3 Step 1 findings on `sortOrder=2` and `--type any`.
    - Every parsing anchor from Tasks 2 and 4.
    - The `robots.txt` summary, dated 2026-11-21.
  - `cli/README.md` follows euraxess `cli/README.md` and states the fixture date.

- [ ] **Step 5: Update the root `README.md` Sources row** to:
  `| [\`jobs-ac-uk-search\`](.agents/skills/jobs-ac-uk-search/SKILL.md) | jobs.ac.uk: UK funded PhD and MRes/MPhil studentships, filtered to those open to international students | ✅ working |`
  Remove "(RSS)". Add a quick-start example: `bun run .agents/skills/jobs-ac-uk-search/cli/src/cli.ts search --discipline health-and-medical --format table`.

- [ ] **Step 6: Final verification.** Run `cd .agents/skills/jobs-ac-uk-search/cli && bunx tsc --noEmit && bun test`, then the same in `euraxess-search/cli`. Expected: both suites pass with no type errors. Then run `bun run .agents/skills/jobs-ac-uk-search/cli/src/cli.ts search --discipline health-and-medical --pages 1 --format table` from the repo root. Expected: a table of real studentships.

- [ ] **Step 7: Commit** with message `Document jobs-ac-uk-search and add hidden-text and live smoke tests` and the trailer.
