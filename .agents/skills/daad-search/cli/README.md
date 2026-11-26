# daad-cli

A Bun CLI with zero runtime dependencies for DAAD's International Programmes database: English-taught
master's programmes in Berlin and Brandenburg, tuition-free by default. It calls the database's
JSON search endpoint and parses the public detail pages. See `../SKILL.md` for usage and
`../url-reference.md` for the API parameters and parsing anchors.

```bash
bun run src/cli.ts search -q health --format table
bun install && bun run typecheck && bun run test   # dev types + tests (one live smoke test)
```

The test fixtures in `tests/fixtures/` are real responses saved on 2026-11-26 (`FIXTURE_DATE` in
`tests/helpers.ts`). If DAAD changes its API or markup, save fresh responses over them, update
`FIXTURE_DATE`, and update `url-reference.md`. The live smoke test skips itself, printing the
reason, when the site answers with a 5xx or not at all.

`DAAD_DELAY_MS` sets the pause between requests and before the single retry (default 2000).
The tests set it to 0.
