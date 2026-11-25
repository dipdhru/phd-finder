# jobs.ac.uk URL and parsing reference

Verified against the live site on 2026-11-19 and 2026-11-21. The site was offline on
2026-11-25, for a security incident that returned 500 on every page.

## Access

- `robots.txt`: `Disallow: /job/feedback/` and `Disallow: /enhanced/fp/` only; sitemap at `/sitemapindex.xml`.
- The terms (`/legal/terms-and-conditions/`) have no clause on automated access.
- RSS is gone: `/feeds` and `/rss` return 404.
- User-Agent: `Mozilla/5.0 (compatible; jobs-ac-uk-cli/1.0)`. Wait about 1 s between requests.

## Search

```
https://www.jobs.ac.uk/search/?sortOrder=1&pageSize=25&startIndex=1&jobTypeFacet[0]=phds&fundingTypeFacet[0]=international-students
```

| Parameter | Values |
|-----------|--------|
| `sortOrder` | `1` newest first; `2` closing soonest. Checked: Closes dates ascend from 23 Nov to 30 Nov on page 1. |
| `pageSize` | `25`. Larger values are ignored, and the site still returns 25. |
| `startIndex` | 1-based offset: `1`, `26`, `51`, … |
| `keywords` | free text |
| `jobTypeFacet[0]` | `phds`, `masters`. Without it, the search includes staff jobs. |
| `fundingTypeFacet[0]` | `international-students`, `eu-students`, `uk-students`, `self-funded-students` |
| `academicDisciplineFacet[0]` | see below |
| `locationFacet[0]` | slugs such as `united-kingdom`, `england`, `scotland`, `ireland`, `germany`, `europe`, `asia`, `hong-kong` (only locations that have adverts appear) |

- The `masters` search page is also reachable as `/search/masters`, and the PhD one as `/search/phds`.
- Whether `jobTypeFacet[0]=phds&jobTypeFacet[1]=masters` is OR-ed could not be checked while the site was down. The CLI runs `--type any` as two scans instead.
- **International facet:** it excludes UK-only adverts. On 2026-11-21 the international results listed 4 adverts placed on 19 Nov, but not DTS352, the UK-Home-only advert placed that day.
- Discipline slugs (21):
  - `agriculture-food-and-veterinary`, `architecture-building-and-planning`, `biological-sciences`, `business-and-management-studies`
  - `computer-sciences`, `creative-arts-and-design`, `economics`, `education-studies-inc-tefl`, `engineering-and-technology`
  - `health-and-medical`, `historical-and-philosophical-studies`, `information-management-and-librarianship`, `languages-literature-and-culture`
  - `law`, `mathematics-and-statistics`, `media-and-communications`, `physical-and-environmental-sciences`
  - `politics-and-government`, `psychology`, `social-sciences-and-social-care`, `sport-and-leisure`

### Search-page anchors

| Field | Anchor |
|-------|--------|
| total | `<strong class="job-count">424</strong> PhDs Found` |
| card | split on `class="j-search-result__result` (the block carries `data-advert-id`) |
| `id`, `title` | first `<a href="/job/<ID>/<slug>">title</a>`. IDs look like `DTS352`: 2–4 letters, then 2–5 digits. |
| `department` | `<div class="j-search-result__department">`, often empty |
| `company` | the `<b>` inside `<div class="j-search-result__employer">` |
| `location` | `<div>Location: <city></div>` |
| `salary` | `<strong>Salary: </strong>` up to `</div>`. "Not Specified" counts as none. |
| posted | `<strong>Date Placed: </strong>20 Nov`, with no year |
| deadline | `<span class="j-search-result__date-span j-search-result__date--blue ">24 Mar</span>`, with no year |

## Advert (detail)

`https://www.jobs.ac.uk/job/<ID>` (the slug is optional).

| Field | Anchor |
|-------|--------|
| core | `<script type="application/ld+json">`, a schema.org `JobPosting`: `title`, `hiringOrganization.name`, `jobLocation[].address.{addressLocality,addressRegion,addressCountry}`, `datePosted`, `validThrough` (the deadline), `baseSalary`, and `description` (the full advert HTML) |
| table | `<th class="j-advert-details__table-header">Label:</th><td>value</td>` for Qualification Type, Location, Funding for (`td#funding`), Funding amount, Hours, Placed On (`19th November 2026`), Closes and Reference |
| labelled paragraphs | in the advert HTML: `<p><strong>Start date:</strong> 1<sup>st</sup> October 2027</p>`, plus `Award duration:`, `Sponsor:` and `Number of awards:` |
| sections | a `<p>` that is only a short `<strong>` heading (for example "Supervisors" or "Eligibility criteria"); the following `<p>`s run up to the next such heading |
| apply link | `<a href="…"><div id="job-apply-button">` |
| body | `<div id="job-description">`, which repeats the JSON-LD description |
