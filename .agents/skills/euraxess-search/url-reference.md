# EURAXESS Reference

Verified live on 2026-11-12. EURAXESS is a Drupal site run by the European Commission. It has
no public JSON API, so the CLI parses the server-rendered HTML.

## Access

- No key or login is needed for search and detail pages.
- `robots.txt` has `Disallow: /*?` but also `Allow: /jobs`. Under longest-match rules (RFC 9309)
  `Allow: /jobs` wins for every `/jobs...` URL, so filtered search URLs are allowed.
  `tools/robots_check.py` reports both URL shapes below as ALLOWED. Paths the CLI must never
  use: `*/ajax/*`, `*ajax_form=*`, `*/api/*`, `*/rest/*`, `/user/*`.
- The CLI sends `User-Agent: Mozilla/5.0 (compatible; euraxess-cli/1.0)`. The site accepts it.

## Search

```
GET https://euraxess.ec.europa.eu/jobs/search?f[0]=offer_type:job_offer&f[1]=<facet>:<value>&...&sort[name]=created&sort[direction]=DESC&page=<n>
```

- Filters are Drupal facets: `f[i]=<facet>:<value>`, URL-encoded (`f%5B0%5D=offer_type%3Ajob_offer`).
  Several values of one facet are OR-ed, and different facets are AND-ed.
- **Keywords are a facet too:** `f[i]=keywords:<text>`. The search box posts a form that
  redirects to this URL. The parameters `keywords=`, `keys=` and `search_api_fulltext=` are
  ignored. Multi-word text is AND-ed: "machine learning" gives 123 results, "machine" 138.
- `page` is **0-indexed** and omitted for the first page. 10 offers per page.
- Total: `Search results <span> (N)` in the page heading.
- Sort: `created DESC` (newest) or `field_job_application_deadline_z ASC` (closing soonest).

### Facet ids (option values of the filter `<select>`s)

| Facet | Values |
|-------|--------|
| `offer_type` | `job_offer`, `funding`, `hosting` |
| `positions` | `php_positions` (PhD, sic), `master_positions`, `postdoc_positions`, `bachelor_positions`, `undergraduate_positions`, `research_support_positions`, `other_positions` |
| `job_research_profile` | `447` R1, `448` R2, `449` R3, `450` R4, `6054` Other profession |
| `job_is_eu_founded` | `4348` Horizon Europe - MSCA, `4349` COFUND, `4345` ERC, `4346` EIC, `4344` Horizon Europe, `6050` Horizon Europe (other), `6051` Horizon 2020, `5341` Erasmus+, `5825` Digital Europe, `5824`/`6052` NextGenerationEU, `5436` Interreg, `6026` LIFE, `6053` Other EU programme, `555` Not funded by an EU programme |
| `job_country` | 50 ids, e.g. `794` Germany, `798` Netherlands, `771` United Kingdom, `763` Ireland, `793` France. Full table in `cli/src/helpers.ts` (`COUNTRIES`). |
| `job_research_field` | 322 ids (not exposed by the CLI; keywords cover it) |

Live counts on 2026-11-12: 6,867 job offers, 1,133 tagged PhD, 47 PhD in Germany.

### Result card anchors

Results are split on `<article class="ecl-content-item"`, and each card is parsed on its own.

| CLI field | Anchor |
|-----------|--------|
| `id`, `url` | `<h3 class="ecl-content-block__title"><a href="/jobs/<id>">` |
| `title` | text of that link |
| `company` | first `ecl-content-block__primary-meta-item` that is not "Posted on:" |
| `date` | `Posted on: 12 November 2026` |
| `location`, `country`, `offers` | block `class="id-Work-Locations "`: `Number of offers: N, <Country>, <institute>, <city>, ...` |
| `researchFields` | block `id-Research-Field`, one `<div>` per "Field » Subfield" |
| `profiles` | links in block `id-Researcher-Profile` |
| `fundingProgramme` | links in block `id-Funding-Programme` |
| `deadline` | block `id-Application-Deadline`: `<time datetime="UTC">26 Nov 2026 - 23:59 (Europe/Madrid)</time>`. The date comes from the displayed local text, not the UTC attribute, which can fall on the next day. |
| `summary` | `<div class="ecl-content-block__description">` |

Each labelled block runs from its `class="id-<Label> "` to the `<div` that opens the next one.

## Detail

```
GET https://euraxess.ec.europa.eu/jobs/<id>
```

- Title: `<meta property="og:title">`. The `<h1>` only says "Job offer", and the JSON-LD
  block is just a breadcrumb.
- Sections are `<h2 id="...">` blocks: `job-information`, `offer-description`, `where-to-apply`,
  `requirements`, `additional-information`, `work-locations`, `contact`.
- `job-information` is a `<dl>` with `ecl-description-list__term` / `__definition` pairs:
  Organisation/Company, Department, Research Field, Researcher Profile, Positions,
  Application Deadline, Country, Type of Contract, Job Status (full-/part-time), Hours Per Week,
  Offer Starting Date, "Is the job funded through the EU Research Framework Programme?",
  Marie Curie Grant Agreement Number.
- `where-to-apply` holds the employer's application link as `Website` (`applyUrl`).
- `work-locations` repeats a block per location starting at "Number of offers available".
- `contact` (phone numbers, street addresses) is deliberately not output.
- A hidden `<div style="display:none" id="expiration">STATUS: EXPIRED</div>` template is on
  every detail page. The page's JavaScript shows it only after the deadline, and
  `visibleHtml` removes it.
- A withdrawn offer returns 404, which the CLI reports as `NOT_FOUND`.
