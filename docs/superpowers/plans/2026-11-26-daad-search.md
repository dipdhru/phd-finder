# daad-search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `daad-search` agent skill: a Bun CLI with `search` and `detail` commands for English-taught, tuition-free master's programmes in Berlin and Brandenburg, from DAAD's International Programmes database. `detail` flags the admission requirements that decide whether the user can apply.

**Architecture:**
- `search` calls DAAD's JSON search API, 100 results per page with offset paging, and maps each course to the shared record shape.
- `detail` reads the server-rendered `<dt>/<dd>` list on the programme page.
- The fetcher, hygiene filters, CLI conventions and test harness are copied from `.agents/skills/jobs-ac-uk-search/cli`. Copy and adapt; don't import across skills.

**Tech Stack:** Bun and TypeScript, with zero runtime dependencies. Dev dependencies are `typescript ^5.4.0` and `@types/bun 1.3.14`. Tests use `bun test`.

**Spec:** `docs/superpowers/specs/2026-11-26-daad-search-design.md`

**Branch:** `feature/daad-search` (created from local `main`, with the spec committed).

## Global Constraints

- Zero runtime dependencies (`"dependencies": {}`).
- User-Agent is exactly `Mozilla/5.0 (compatible; daad-cli/1.0)`.
- Wait 2 s between requests, from env `DAAD_DELAY_MS` (default `2000`; tests set `0`). Retry once after a backoff on a network error, 429 or 5xx. A 404 returns `null`.
- Base URL: `https://www2.daad.de`. The search API is `/deutschland/studienangebote/international-programmes/api/solr/en/search.json`. The detail page is `/deutschland/studienangebote/international-programmes/en/detail/<id>/`.
- Default cities, in this order: `Berlin`, `Potsdam`, `Cottbus`, `Frankfurt (Oder)`, `Eberswalde`, `Wildau`, `Senftenberg`, `Brandenburg an der Havel`.
- Errors go to stderr as one line of `{"error","code"}`, the exit code is 1, and stdout stays empty. The codes are `BAD_ARG`, `UNKNOWN_FLAG`, `SEARCH_FAILED`, `PARSE_FAILED`, `BAD_ID`, `NOT_FOUND`, `DETAIL_FAILED` and `NO_ID`.
- Every result passes through `stripInvisible` just before output. Every HTML-bearing string, which includes API fields such as `applicationDeadline`, goes through `clean`/`cleanMultiline`. These functions are copied unchanged from `jobs-ac-uk-search/cli/src/helpers.ts`.
- Requirement and deadline hints are flags to check, never a verdict, and the docs must say so.
- No `Co-Authored-By` trailer in commit messages (the user's preference for this repo).
- Test command, run from `.agents/skills/daad-search/cli`: `bunx tsc --noEmit && bun test --timeout 30000`.

## Review Focus

1. **Deadline text in all its forms**:
   - "Register by 1 June 2027"
   - "Register by 15 August 2026 + 3 more"
   - HTML paragraphs with day and month but no year
   - "This programme has no deadline."
   - Expected: `deadline` and `deadlineStatus` follow the spec's rules (`open` / `past` / `unknown`), and no form is misread as a date. Test: Task 2.
2. **A 200 response that isn't the expected JSON** (an HTML error page, or JSON without `courses`) must give `PARSE_FAILED`, never "no programmes". Test: Task 3.
3. **Paging edges.** Paging stops once `numResults` is reached or a page holds fewer than 100 courses. A course seen twice is output once. Test: Task 3.
4. **`--fees free` matching.** It keeps only `tuitionFees` equal to "No tuition fees" (ignoring case and spaces). "Tuition varies", amounts and `null` are dropped. Test: Task 2.
5. **City names.**
   - `--city potsdam,frankfurt (oder)` maps case-insensitively to the canonical names and is URL-encoded correctly.
   - Unknown cities are sent as typed.
   - Test: Task 3.

---

## File Structure

All paths below are under `.agents/skills/daad-search/`.

| File | Responsibility |
|------|----------------|
| `SKILL.md`, `url-reference.md` | Agent-facing usage, visa notes, endpoint and anchor reference |
| `cli/package.json`, `cli/tsconfig.json`, `cli/README.md` | Copied from jobs-ac-uk-search, with the names changed |
| `cli/src/helpers.ts` | `BASE`, `writeError`, `sleep`, `delayMs`, `fetchText`, and the hygiene functions |
| `cli/src/parse-search.ts` | `Programme`, `parseDeadline`, `isFree`, `mapCourse`, `parseSearchResponse` |
| `cli/src/query.ts` | `DEFAULT_CITIES`, `canonicalCity`, `SearchParams`, `searchUrl` |
| `cli/src/parse-detail.ts` | `ProgrammeDetail`, `RequirementSignals`, `requirementSignals`, `parseDetail` |
| `cli/src/commands/search.ts`, `cli/src/commands/detail.ts`, `cli/src/cli.ts` | Commands, rendering, flags |
| `cli/tests/helpers.ts` + `fetch`, `parse-search`, `search-cli`, `detail`, `hidden-text`, `live-smoke` test files | Tests |
| `cli/tests/fixtures/search-p1.json`, `search-p2.json`, `detail-5252.html` | Real responses |

The root `README.md` gets a row and an example.

---

### Task 1: Scaffold, fetcher and fixtures

**Files:** Create `cli/package.json`, `cli/tsconfig.json`, `cli/src/helpers.ts`, `cli/tests/helpers.ts`, `cli/tests/fetch.test.ts`, and the three fixtures.

**Interfaces:**
- Produces:
  - `BASE = "https://www2.daad.de"`
  - `writeError(error, code)`, `sleep(ms)`, `delayMs()` (reads `DAAD_DELAY_MS`, default 2000)
  - `fetchText(url: string, accept: string): Promise<string | null>`, with the same retry contract as jobs-ac-uk-search `htmlFetch`
  - The copied hygiene functions
  - Test side: `runCLI`, `runWithServer` (origin `https://www2.daad.de`, env `DAAD_DELAY_MS=0`), `fixture`, `html(body, status)`, `json(body, status)`, `err`, `parseJSON`, `FIXTURE_DATE`

- [ ] **Step 1: Create the package files.** Copy them from `jobs-ac-uk-search/cli`. Set `name` to `daad-cli` and `bin` to `daad-search`. Run `bun install`.
- [ ] **Step 2: Save the fixtures.** From `cli/`, with `UA='Mozilla/5.0 (compatible; daad-cli/1.0)'` and `A=https://www2.daad.de/deutschland/studienangebote/international-programmes`:
  - `tests/fixtures/search-p1.json`: `$A/api/solr/en/search.json?degree%5B%5D=2&lang%5B%5D=2&cit%5B%5D=Berlin&cit%5B%5D=Potsdam&cit%5B%5D=Cottbus&cit%5B%5D=Frankfurt%20%28Oder%29&cit%5B%5D=Eberswalde&cit%5B%5D=Wildau&cit%5B%5D=Senftenberg&cit%5B%5D=Brandenburg%20an%20der%20Havel&limit=100&offset=0&sort=4&display=list`
  - `tests/fixtures/search-p2.json`: the same URL with `offset=100`.
  - `tests/fixtures/detail-5252.html`: `$A/en/detail/5252/`.
  - Leave 2 s between requests.
  - Expected: p1 has `numResults >= 150` and 100 courses; p2 holds the remainder; detail contains `Academic admission requirements`.
  - Set `FIXTURE_DATE` to the save day.
- [ ] **Step 3: Write `tests/helpers.ts`** by adapting jobs-ac-uk-search's version:
  - Change the origin and the env variable.
  - Add `json(body: unknown, status = 200)`, which returns a JSON `Response`.
  - Move `err` here if it isn't already.
- [ ] **Step 4: Write `tests/fetch.test.ts`.** It mirrors jobs-ac-uk-search's five tests (network error then success; 503 then success; two 503s rejects with exactly 2 calls; 404 → null with 1 call; the User-Agent header), with one addition:

```ts
test("sends the requested Accept header") // fetchText(url, "application/json") → headers.Accept === "application/json"
```

- [ ] **Step 5: Run the tests to see them fail.** Run `bun test tests/fetch.test.ts`. Expected: FAIL, because `helpers.ts` is not found.
- [ ] **Step 6: Implement `src/helpers.ts`.** Copy jobs-ac-uk-search `helpers.ts`. Rename `htmlFetch` to `fetchText(url, accept)`, change the UA, the env variable (`DAAD_DELAY_MS`) and its default (2000), and update the header comment to describe DAAD.
- [ ] **Step 7: Run the tests to see them pass.** Run `bun test tests/fetch.test.ts && bunx tsc --noEmit`. Expected: 6 pass.
- [ ] **Step 8: Commit** with message `Add daad-search scaffold, paced fetcher with retry, and fixtures`.

---

### Task 2: Mapping search results

**Files:** Create `cli/src/parse-search.ts` and `cli/tests/parse-search.test.ts`.

**Interfaces:**
- Consumes: `BASE`, `clean` (Task 1).
- Produces:
  ```ts
  export type DeadlineStatus = "open" | "past" | "unknown"
  export interface Programme {
    id: string; title: string; company: string | null; location: string | null; country: "Germany"
    url: string; languages: string[]; beginning: string | null; duration: string | null
    tuitionFees: string | null; subject: string | null
    deadline: string | null; deadlineText: string | null; deadlineStatus: DeadlineStatus
  }
  export function parseDeadline(text: string | null, today: Date): { deadline: string | null; status: DeadlineStatus }
  export function isFree(tuitionFees: string | null): boolean
  export function mapCourse(course: Record<string, unknown>, today: Date): Programme | null   // null without id or courseName
  export function parseSearchResponse(body: string, today: Date): { programmes: Programme[]; total: number }  // throws ParseError
  export class ParseError extends Error {}
  ```

**Field mapping** (API → Programme):

| API field | Programme field |
|-----------|-----------------|
| `id` | `id` (as a string) |
| `courseName` | `title` (cleaned) |
| `academy` | `company` |
| `city` | `location` |
| `link` | `url = BASE + link` |
| `languages` | `languages` |
| `beginning` | `beginning` |
| `programmeDuration` | `duration` |
| `tuitionFees` | `tuitionFees` |
| `subject` | `subject` |
| `applicationDeadline` | `deadlineText`, via `cleanMultiline` |

All strings go through `clean`.

**Deadline rule:**
- Collect every `D Month YYYY` date in the text (full English month names; `Month D, YYYY` is not needed).
- `deadline` is the first date found.
- `status`:
  - `open` if any date is on or after the UTC day of `today`, or if the text has `+ <n> more`;
  - `past` if there are dates and none of the above;
  - `unknown` if there are no dates.

- [ ] **Step 1: Write the failing tests.**

```ts
test("parseDeadline: single future date is open")       // ("Register by 1 June 2027", 2026-11-26) → { deadline: "2027-06-01", status: "open" }
test("parseDeadline: past date with more dates is open") // ("Register by 15 August 2026 + 3 more") → { deadline: "2026-08-15", status: "open" }
test("parseDeadline: past date alone is past")           // ("Register by 15 August 2026") → { "2026-08-15", "past" }
test("parseDeadline: no year or no deadline is unknown")
  // ("Application deadline for the winter semester: 1 June (first semester)") → { null, "unknown" }
  // ("This programme has no deadline.") → { null, "unknown" }; (null) → { null, "unknown" }
test("parseDeadline: same day is open")                  // ("Register by 26 November 2026", 2026-11-26) → "open"
test("isFree accepts only 'No tuition fees'")
  // isFree("No tuition fees") && isFree(" no tuition FEES ") === true; isFree("Tuition varies"), isFree("9,950"), isFree(null) === false
test("parseSearchResponse maps the real fixture")
  // programmes.length === 100; total >= 150; every p: id /^\d+$/, url startsWith BASE + "/deutschland/studienangebote/international-programmes/en/detail/",
  //   title non-empty, country "Germany", deadlineText has no "<"
  // the programme with id "5252": title "Digital Health", company "University of Potsdam", location "Potsdam", tuitionFees "No tuition fees"
test("parseSearchResponse rejects non-JSON and JSON without courses")
  // "<html>error</html>" and '{"numResults":3}' → throws ParseError
```

- [ ] **Step 2: Run the tests to see them fail.** Run `bun test tests/parse-search.test.ts`. Expected: FAIL, because the module is not found.
- [ ] **Step 3: Implement `src/parse-search.ts`** following the mapping and the deadline rule. `total` is `numResults`, or `programmes.length` when it's missing.
- [ ] **Step 4: Run the tests to see them pass.** Run `bun test tests/parse-search.test.ts && bunx tsc --noEmit`. Expected: 8 pass.
- [ ] **Step 5: Commit** with message `Map DAAD search results with deadline status`.

---

### Task 3: Search command and CLI flags

**Files:** Create `cli/src/query.ts`, `cli/src/commands/search.ts`, `cli/src/cli.ts`, and `cli/tests/search-cli.test.ts`.

**Interfaces:**
- Consumes: `fetchText`, `sleep`, `delayMs`, `stripInvisible`, `writeError` (Task 1); `parseSearchResponse`, `isFree`, `ParseError`, `Programme` (Task 2).
- Produces:
  ```ts
  // query.ts
  export const DEFAULT_CITIES: string[]           // the 8 names from Global Constraints, in order
  export function canonicalCity(input: string): string   // case-insensitive match to DEFAULT_CITIES, else input.trim()
  export interface SearchParams { query?: string; cities: string[] }
  export const PAGE_SIZE = 100
  export function searchUrl(p: SearchParams, offset: number): string
  // commands/search.ts
  export interface SearchOpts extends SearchParams { fees: "free" | "any"; start: "winter" | "summer" | "any"; openOnly: boolean; pages: number; limit?: number; format: "json" | "table" | "plain" }
  export function runSearch(opts: SearchOpts): Promise<number>
  ```
- `searchUrl` sends these parameters in this order: `degree[]=2`, `lang[]=2`, one `cit[]` per city, then `q` (only when a query is given), `limit=100`, `offset`, `sort=4`, `display=list`.
- Filtering happens client-side after mapping:
  - `fees=free` → `isFree`.
  - `start` → a case-insensitive substring of `beginning` ("winter semester" / "summer semester").
  - `openOnly` → drop `past`.
- JSON output is `{ meta: { count, pagesScanned, total }, results }`. `total` is DAAD's `numResults`, counted before the client-side filters.

- [ ] **Step 1: Check the `fee` facet on the live site.** Request the default query with `fee=1` and with `fee=4`. If either returns exactly the programmes whose `tuitionFees` is "No tuition fees", record it for `url-reference.md`. Keep filtering on the client either way, because it is what the tests pin. Note the result in the ledger.
- [ ] **Step 2: Write the failing tests.** Use `runWithServer`; it answers with `json(await fixture("search-p1.json"))` unless noted.

```ts
test("default request: master's, English, the 8 cities, first 100")
  // requests[0].url.pathname ends with "/api/solr/en/search.json";
  // searchParams.getAll("degree[]") == ["2"], getAll("lang[]") == ["2"], getAll("cit[]") == DEFAULT_CITIES,
  // get("limit")=="100", get("offset")=="0", get("sort")=="4", get("display")=="list", has("q")==false
test("--city maps case-insensitively and keeps unknown names")
  // --city "potsdam,frankfurt (oder),Leipzig" → getAll("cit[]") == ["Potsdam","Frankfurt (Oder)","Leipzig"]
test("-q is sent as q")                                  // -q "data science" → get("q") == "data science"
test("--fees free is the default and keeps only tuition-free programmes")
  // every result's tuitionFees === "No tuition fees"; with --fees any, results include a non-free one
test("--start winter keeps only programmes starting in winter")   // every beginning matches /winter/i
test("--open-only drops past deadlines")                // no result has deadlineStatus "past"
test("pages through offset 0, 100 and stops at numResults")
  // --pages 5, offset 0 → p1, offset 100 → p2 → exactly 2 requests; ids unique
test("a repeated course is output once")                // p1 on every offset, numResults 300, --pages 2 → ids unique
test("--limit stops after the first page that fills it") // --limit 5 → 1 request, 5 results
test("HTML or courses-less JSON with status 200 exits 1 with PARSE_FAILED and empty stdout")
test("persistent 503 exits 1 with SEARCH_FAILED and empty stdout")
test("table and plain show the Digital Health row")     // stdout contains "Digital Health" and "University of Potsdam"
for bad of [["--pages","11"],["--fees","cheap"],["--start","spring"],["--city",""],["-q",""],["--format","xml"]]
  test(`${bad} exits 1 with BAD_ARG`)
test("--level is rejected with UNKNOWN_FLAG")
```

- [ ] **Step 3: Run the tests to see them fail.** Run `bun test tests/search-cli.test.ts`. Expected: FAIL, because `cli.ts` is not found.
- [ ] **Step 4: Implement `query.ts`, `commands/search.ts` and the search half of `cli.ts`.**
  - Base the flag parsing, validation and help text on jobs-ac-uk-search `cli.ts`.
  - Search flags: `query city fees start open-only pages limit format help h`, with aliases `q`, `n`.
  - `--pages` is 1–5 (default 2). `--limit` is 1–10000.
  - Paging:
    - Sleep `delayMs()` between pages.
    - Stop when a page has fewer than `PAGE_SIZE` courses, or `offset + PAGE_SIZE >= total`, or the limit is reached.
    - Build all output before writing anything.
    - Catch `ParseError` → `PARSE_FAILED`, anything else → `SEARCH_FAILED`.
  - Table columns: ID (6), TITLE (44), UNIVERSITY (30), CITY (12), FEES (16), DEADLINE (status + date).
  - Plain output per programme: title; then `company · city`; then `starts … · fees … · duration …`; then `deadline: <deadlineText>  [status]`; then the URL.
- [ ] **Step 5: Run the tests to see them pass.** Run `bun test tests/search-cli.test.ts && bunx tsc --noEmit`. Expected: all pass.
- [ ] **Step 6: Commit** with message `Add DAAD search command with Berlin/Brandenburg, fee and deadline filters`.

---

### Task 4: Detail parsing and command

**Files:** Create `cli/src/parse-detail.ts`, `cli/src/commands/detail.ts` and `cli/tests/detail.test.ts`. Modify `cli/src/cli.ts` to add `detail`.

**Interfaces:**
- Consumes: `fetchText`, `clean`, `stripInvisible`, `writeError`, `BASE` (Task 1).
- Produces:
  ```ts
  export interface RequirementSignals {
    bachelorSubject: string | null; englishLevel: string | null; englishCertificate: boolean
    ielts: string | null; toefl: string | null; germanRequired: string | false | null
    uniAssist: boolean; combinedPhd: boolean | null
  }
  export interface ProgrammeDetail {
    id: string; title: string; company: string | null; location: string | null; country: "Germany"; url: string
    degree: string | null; cooperation: string | null; teachingLanguage: string | null; duration: string | null
    beginning: string | null; applicationPeriods: string | null; tuitionFees: string | null
    semesterContribution: string | null; costsOfLiving: string | null; admissionRequirements: string | null
    germanSkills: string | null; englishSkills: string | null; submitVia: string | null
    requirementSignals: RequirementSignals
  }
  export function requirementSignals(d: Omit<ProgrammeDetail, "requirementSignals">): RequirementSignals
  export function parseDetail(html: string, id: string): ProgrammeDetail | null   // null when no <dt>/<dd> pairs
  export function normalizeId(input: string): string | null   // in commands/detail.ts
  ```

**Anchors:**
- `title`: the `<title>` text with the suffix ` - International Programmes - DAAD` removed.
- `company`: `c-detail-header__subtitle`, the text before "•".
- Fields: `<dt>Label</dt>\s*<dd>…</dd>` pairs, where the first occurrence of each label wins:

| Label | Field |
|-------|-------|
| Degree | `degree` |
| Course location | `location` |
| In cooperation with | `cooperation` |
| Teaching language | `teachingLanguage` |
| Programme duration | `duration` |
| Beginning | `beginning` |
| Application periods | `applicationPeriods` |
| Combined Master's degree / PhD programme | `combinedPhd` (Yes/No) |
| Tuition fees per semester | `tuitionFees` |
| Semester contribution | `semesterContribution` |
| Costs of living | `costsOfLiving` |
| Academic admission requirements | `admissionRequirements` |
| German language skills | `germanSkills` |
| English language skills | `englishSkills` |
| Submit application via | `submitVia` |

**`requirementSignals` patterns:**
- `bachelorSubject`: in the admission text, `/Bachelor['’]?s degree\)?\s+in\s+([^.;:]{3,80}?)(?=\s+(?:Proof|with|and proof)\b|[.;:]|$)/i`, trimmed.
- `englishLevel`: the first `\b(B1|B2|C1|C2)\b` in `englishSkills`.
- `englishCertificate`: `/certificate|IELTS|TOEFL|Cambridge|PTE/i` matches `englishSkills`.
- `ielts`: `/IELTS[^:]*:\s*([\d.]+)/i`.
- `toefl`: `/TOEFL iBT[^:]*:\s*(\d+)/i`.
- `germanRequired`:
  - `false` when `germanSkills` matches `/no minimum language level|not required|none/i`;
  - else the first CEFR level found (`A1`–`C2`);
  - else `null`.
- `uniAssist`: `/uni-assist/i` in applicationPeriods, submitVia or admissionRequirements.
- `combinedPhd`: Yes → true, No → false, otherwise null.

**`normalizeId`:** accepts digits only (1–7), or a URL whose host is `www2.daad.de` and whose path matches `/deutschland/studienangebote/international-programmes/(en|de)/detail/<id>/`. Any other host → null.

- [ ] **Step 1: Write the failing tests.**

```ts
test("parseDetail reads the Digital Health fixture")
  // d.title === "Digital Health"; d.company === "University of Potsdam"; d.location === "Potsdam"; d.degree === "Master of Science"
  // d.cooperation contains "Hasso Plattner Institute"; d.beginning === "Winter semester"
  // d.applicationPeriods contains "1 April - 1 June"; d.tuitionFees === "None"; d.semesterContribution contains "322 EUR"
  // d.costsOfLiving contains "941 EUR"; d.admissionRequirements contains "Computer Science or a related subject"
  // signals: bachelorSubject === "Computer Science or a related subject"; englishLevel === "C1"; englishCertificate true;
  //   ielts === "7"; toefl === "95"; germanRequired === false; combinedPhd === false
test("requirementSignals: German level and uni-assist")
  // germanSkills "German B2 required", submitVia "Apply via uni-assist" → germanRequired "B2", uniAssist true
test("a page without <dt>/<dd> pairs gives null")
test("detail CLI: 404 → NOT_FOUND; 200 without pairs → PARSE_FAILED; both with empty stdout")
test("detail CLI requests /en/detail/<id>/ and plain output shows the requirement warnings")
  // pathname === "/deutschland/studienangebote/international-programmes/en/detail/5252/";
  // plain stdout contains "C1" and "Computer Science or a related subject"
test("normalizeId")
  // "5252"→"5252"; "https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/5252/"→"5252";
  // ".../de/detail/5252/"→"5252"; "https://www2.daad.de.evil.io/.../en/detail/5252/"→null; "abc"→null
test("detail with a bad id exits 1 with BAD_ID")
```

- [ ] **Step 2: Run the tests to see them fail.** Run `bun test tests/detail.test.ts`. Expected: FAIL, because the module is not found.
- [ ] **Step 3: Implement `parse-detail.ts`, `commands/detail.ts` and the detail half of `cli.ts`.**
  - Flags: `format help h`.
  - Plain output, in order:
    1. Title, then `company · location`, then a blank line.
    2. Degree, Teaching language, Duration, Beginning, Combined master's/PhD.
    3. A `REQUIREMENTS TO CHECK` block, one line each for: bachelor's subject; English level, certificate and IELTS/TOEFL; German; uni-assist.
    4. Application periods, Tuition fees, Semester contribution, Costs of living.
    5. `ADMISSION REQUIREMENTS` text, then `How to apply: …`, then `URL: …`.
  - Error codes: `BAD_ID`, `NOT_FOUND` (fetch returned null), `PARSE_FAILED` (parse returned null), `DETAIL_FAILED` (fetch threw).
- [ ] **Step 4: Run the tests to see them pass.** Run `bunx tsc --noEmit && bun test --timeout 30000`. Expected: the whole suite passes.
- [ ] **Step 5: Commit** with message `Add DAAD detail command with admission requirement hints`.

---

### Task 5: Hidden-text guard, live smoke test and docs

**Files:** Create `cli/tests/hidden-text.test.ts`, `cli/tests/live-smoke.test.ts`, `cli/README.md`, `SKILL.md` and `url-reference.md`. Modify the root `README.md`.

- [ ] **Step 1: Write the tests.**

```ts
// hidden-text.test.ts — copy the probe constants from jobs-ac-uk-search/cli/tests/hidden-text.test.ts
test("search output carries no invisible characters or hidden markup")
  // in search-p1.json, set the 5252 course's applicationDeadline to `<p>Visible.${INVISIBLE}</p>${HIDDEN}` and its courseName to
  // `Digital${INVISIBLE} Health`; for json|plain|table: exit 0, no INVISIBLE_CHAR, no "HIDDEN", contains "Visible."
test("detail output carries no invisible characters or hidden markup")
  // in detail-5252.html, inject `Visible intro.${INVISIBLE}` + HIDDEN at the start of the
  // "Academic admission requirements" <dd>; for json|plain: no INVISIBLE_CHAR, no "HIDDEN", contains "Visible intro."
// live-smoke.test.ts — probe www2.daad.de first; skip with a printed reason on 5xx or no response (as in jobs-ac-uk-search)
test("live search and detail return real programmes")
  // search --pages 1 --limit 5 → results.length > 0, every id /^\d+$/, location in DEFAULT_CITIES;
  // detail of results[0].id → same id, non-empty title
```

- [ ] **Step 2: Run the tests.** Run `bun test --timeout 30000`. Expected: all pass. A hidden-text failure is fixed in the output path, never in the test.
- [ ] **Step 3: Write `SKILL.md`, following jobs-ac-uk-search's layout.**
  - Frontmatter:
    - `name: daad-search`
    - `context: fork`
    - `enabled: true`
    - `allowed-tools: Bash(bun run .agents/skills/daad-search/cli/src/cli.ts *)`
  - The description's triggers: master's in Germany, master's in Berlin / Potsdam / Brandenburg, English-taught master's, tuition-free master's, MSc Germany, DAAD, international programmes, Masterstudium.
  - Body: commands with every flag and default; requirement hints (not a verdict); deadline status and why past dates are kept; the visa notes listed in the spec's Docs section; usage examples (including `-q "data science"`, `-q health`, `detail 5252 --format plain`); output formats; notes (coverage is DAAD's international selection only, no German-taught programmes, 2 s pacing).
- [ ] **Step 4: Write `url-reference.md` and `cli/README.md`.**
  - `url-reference.md` covers the API parameters and response fields, the `fee` facet finding from Task 3 Step 1, the detail anchors from Task 4, the `robots.txt` and imprint notes, and the 404 for a missing id. Mark everything as verified 2026-11-26.
  - `cli/README.md` states the fixture date and `DAAD_DELAY_MS`.
- [ ] **Step 5: Update the root `README.md`.**
  - Replace the `daad-search` row with `| [\`daad-search\`](.agents/skills/daad-search/SKILL.md) | DAAD International Programmes: English-taught master's in Berlin and Brandenburg, tuition-free by default | ✅ working |`.
  - Add a quick-start example: `bun run .agents/skills/daad-search/cli/src/cli.ts search -q health --format table`.
- [ ] **Step 6: Final verification.** Run the test command in all three skill CLIs. Expected: all pass. Then run `bun run .agents/skills/daad-search/cli/src/cli.ts search --format table` from the repo root. Expected: a table of real Berlin and Brandenburg programmes.
- [ ] **Step 7: Commit** with message `Document daad-search and add hidden-text and live smoke tests`.
