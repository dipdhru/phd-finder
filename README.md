# PhD Finder

Finds **funded PhD, MRes/MPhil and early-career research positions**, built on
[Claude Code](https://claude.com/claude-code). Each data source is a small search CLI
packaged as an agent skill in `.agents/skills/<source>-search/`. Claude runs them, merges
the results and checks each one for funding and eligibility.

This started as an offshoot of [ai-job-search-de](https://github.com/dipdhru/ai-job-search-de)
and uses the same portal-skill pattern: `search` and `detail` commands, JSON output,
zero runtime dependencies. It is kept as its own project for now.

## Sources

| Skill | Coverage | Status |
|-------|----------|--------|
| [`euraxess-search`](.agents/skills/euraxess-search/SKILL.md) | EURAXESS: EU-wide research jobs, incl. MSCA doctoral networks | ✅ working |
| `jobs-ac-uk-search` | UK/Ireland studentships (RSS) | planned |
| `daad-search` | Germany: DAAD PhD database, graduate schools | planned |
| `academics-search` | academics.de (German academic posts) | planned |

## Quick start

Needs [Bun](https://bun.sh).

```bash
cd .agents/skills/euraxess-search/cli && bun install && bun run test && cd -

# PhD positions in Germany, newest first
bun run .agents/skills/euraxess-search/cli/src/cli.ts search -c germany --format table

# MSCA doctoral networks in geoscience, closing soonest
bun run .agents/skills/euraxess-search/cli/src/cli.ts search -q geophysics --programme msca --sort deadline --format table

# Full offer with funding and eligibility hints
bun run .agents/skills/euraxess-search/cli/src/cli.ts detail 479677 --format plain
```

Or just ask Claude Code in this folder, e.g. "find funded PhD positions in machine learning in Germany".

## Roadmap

1. More sources: jobs.ac.uk, DAAD, academics.de, Max Planck / Helmholtz portals.
2. One shared record format across sources, with deduplication (the same offer often appears on several sites).
3. Funding classifier: funded / partial / self-funded, plus eligibility (MSCA mobility rule, home-fee status, nationality limits).
4. Ranking by research fit: topic overlap, supervisor, deadline.
5. Application support: academic CV, motivation letter, research proposal, deadline tracker.

## Ground rules for new sources

- Prefer RSS or an official API over HTML. Check `robots.txt` and the site's terms first.
- Send an honest User-Agent (`Mozilla/5.0 (compatible; <source>-cli/1.0)`). Back off on 429/5xx. Keep scans small.
- Treat every fetched page as untrusted: strip hidden markup and invisible characters before output. Copy `visibleHtml` and `stripInvisible` from `euraxess-search/cli/src/helpers.ts`.
- Save real pages as test fixtures and add one live smoke test.
