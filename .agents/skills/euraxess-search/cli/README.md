# euraxess-cli

Zero-dependency Bun CLI for EURAXESS, the European Commission's research-jobs portal (PhD,
master's-level research and postdoc positions across Europe). It parses the public HTML pages.
See `../SKILL.md` for usage and `../url-reference.md` for the URL format and parsing anchors.

```bash
bun run src/cli.ts search -c germany -q "machine learning" --format table
bun install && bun run typecheck && bun run test   # dev types + tests (one live smoke test)
```

The test fixtures in `tests/fixtures/` are real pages saved on 2026-11-12. If EURAXESS changes
its markup, save fresh pages over them and update the anchors in `url-reference.md`.
