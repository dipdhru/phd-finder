# DAAD International Programmes URL and parsing reference

Verified against the live site on 2026-11-26.

## Access

- `https://www2.daad.de/robots.txt` returns 404, so there are no rules for www2.
- `https://www.daad.de/robots.txt` sets `Crawl-delay: 2` and disallows `/*hec-fetch-offset=` (paging on the other database) and `/app/bsa/api/`. The CLI waits 2 s between requests.
- The imprint says the site content is copyrighted. The CLI fetches results to read them and stores nothing beyond the test fixtures.
- User-Agent: `Mozilla/5.0 (compatible; daad-cli/1.0)`.

## Search API

```
https://www2.daad.de/deutschland/studienangebote/international-programmes/api/solr/en/search.json
  ?degree[]=2&lang[]=2&cit[]=Berlin&cit[]=Potsdam&q=health&limit=100&offset=0&sort=4&display=list
```

| Parameter | Values |
|-----------|--------|
| `degree[]` | `2` master's (`1` bachelor's, `3` PhD/doctorate, others are short courses) |
| `lang[]` | `2` English (`1` German, `4` other or several) |
| `cit[]` | plain city names, OR-ed, e.g. `Frankfurt (Oder)` |
| `q` | keywords |
| `limit` / `offset` | page size (100 works) and 0-based offset (100, 200, … verified) |
| `sort` | `4` (the site's default list order) |
| `fee` | `1` returns exactly the "No tuition fees" programmes (92 of 177 in the default query); `4` is not a fee filter. The CLI filters on `tuitionFees` itself. |

- English-taught master's by city on 2026-11-26: Berlin 117, Potsdam 27, Cottbus 15, Frankfurt (Oder) 10, Eberswalde 5, Wildau 4, Senftenberg 2, Brandenburg an der Havel 0.
- Response: `{ courses: [...], numResults, filter }`.
- Course fields used:
  - `id`, `courseName`, `academy`, `city`, `languages`;
  - `beginning` ("Winter semester, Summer semester"), `programmeDuration`;
  - `tuitionFees` ("No tuition fees", "Tuition varies", or an amount such as "9,950");
  - `applicationDeadline`: either "Register by 1 June 2027 + 1 more", "This programme has no deadline.", or HTML paragraphs;
  - `subject`, `link` (a relative detail path).

## Detail page

`https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/<id>/`. A missing id returns **404**.

| Field | Anchor |
|-------|--------|
| title | `<title>Digital Health - International Programmes - DAAD</title>`, with the suffix removed |
| university | `class="c-detail-header__subtitle"`: the text before "•" ("University of Potsdam • Potsdam") |
| everything else | `<dt>Label</dt><dd>value</dd>` pairs; the first occurrence wins, because "Application periods" appears twice |

`<dt>` labels used:
- Degree, Course location, In cooperation with, Teaching language, Programme duration, Beginning;
- Application periods, Combined Master's degree / PhD programme;
- Tuition fees per semester, Semester contribution, Costs of living;
- Academic admission requirements, German language skills, English language skills, Submit application via.
