# jobs-ac-uk-cli

A Bun CLI with zero runtime dependencies for jobs.ac.uk, the main UK listing site for funded PhD and
MRes/MPhil studentships. It parses the public HTML pages, since the site's RSS feeds are gone.
See `../SKILL.md` for usage and `../url-reference.md` for the URL format and parsing anchors.

```bash
bun run src/cli.ts search --discipline health-and-medical --format table
bun install && bun run typecheck && bun run test   # dev types + tests (one live smoke test)
```

The test fixtures in `tests/fixtures/` are real pages saved on 2026-11-21 (`FIXTURE_DATE` in
`tests/helpers.ts`). If jobs.ac.uk changes its markup, save fresh pages over them, update
`FIXTURE_DATE`, and update the anchors in `url-reference.md`. The live smoke test skips itself,
printing the reason, when the site answers with a 5xx or not at all.

`JOBS_AC_UK_DELAY_MS` sets the pause between requests and before the single retry (default 1000).
The tests set it to 0.
