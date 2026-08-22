# TradeCenter

An interactive world map for global trade — import/export flows, tariffs, money flow
between countries, product-level detail, and a rule-based engine that surfaces business
opportunities from the gaps.

**Running on real data.** 190 reporting countries, 48,022 bilateral flows, 16 HS sector
groups, 2010–2022, ~10,700 tariff pairs — all from World Bank WITS and World Bank Open
Data, no API key required.

## Quick start

```bash
pnpm install

# build the dataset (first run: ~15 min, mostly the WITS fetch)
pnpm data:all --vintage=2026-08-22

pnpm dev            # http://localhost:3000
```

The dataset is already built in `data/processed/` — if you just want to run the app,
`pnpm install && pnpm dev` is enough.

## What's here

| Route | |
|---|---|
| `/` | Full-bleed map. Click a country to draw its trade flows - green out, red in, with arrows and values on the lines - and open a draggable detail panel |
| `/country/[iso]` | Trade profile: KPIs, sector mix and top partners with exports and imports compared on one row, 13-year series, tariff and concentration context |
| `/corridor/[a]/[b]` | Bilateral corridor: both directions, mirror-flow comparison, corridor tariffs, sector overlap |
| `/product/[code]` | Global market for one sector: top exporters and importers, supply concentration |
| `/tariffs` | What a country charges every partner, sortable and searchable |
| `/opportunities` | Scored export opportunities, each showing its full arithmetic |
| `/about/data` | Sources, units, pipeline stages, build statistics, known limitations |

Every filter lives in the URL, so any view you can reach is a permalink - including the
selected country and the metric. Light and dark themes both ship, toggled from the header;
every surface follows it, not just the map.

Country outlines use the Natural Earth **India point-of-view** edition, so Jammu & Kashmir
including Gilgit-Baltistan and Aksai Chin is drawn as Indian territory. The reasoning and
the factual note are on `/about/data`.

## Stack

Next.js 15 · React 19 · TypeScript · MapLibre + deck.gl · Tailwind · Recharts · Python ETL

Full reasoning for each choice, and what was deliberately left out, in
[docs/TECH_STACK.md](docs/TECH_STACK.md).

## Documentation

- **[docs/PRD.md](docs/PRD.md)** — what we're building and for whom
- **[docs/TECH_STACK.md](docs/TECH_STACK.md)** — every technology choice and why
- **[docs/DESIGN.md](docs/DESIGN.md)** — UX, layouts, data model, API, opportunity engine
- **[CLAUDE.md](CLAUDE.md)** — working context, including the domain traps that cause bugs
- **[docs/adr/](docs/adr/)** — architecture decision records

## The data pipeline

```
connectors/  →  data/raw/       fetch only; immutable; provenance sidecar per drop
pipelines/   →  data/processed/ normalize → conform → validate → publish
```

`pnpm data:build` refuses to publish when validation fails. It checks value ranges,
reconciles sector sums against reported country totals, and anchors major economies against
independently published figures. The 2022 build matches reality: China $3,594B, USA
$2,062B, Germany $1,696B, India $453B.

## Exports and imports are always shown together

There is no view anywhere in the product that shows one direction on its own. The map's
two lenses are both comparisons - total trade (exports + imports) and balance
(exports - imports) - the hover tooltip shows both sides plus the total, and every sector
mix and partner list puts the two directions on one row against a shared centre line, with
the net beside the label.

This is deliberate. A large export figure reads as a good figure right up until the import
figure sits next to it, and splitting the two across separate cards or separate toggles
makes that misreading the default.

## A note on the numbers

Trade statistics are lagged, revised, inconsistently coded, and reported twice by parties
who disagree with each other. This project treats that as the core problem rather than a
nuisance:

- Every figure carries its source and vintage, one click away on every view.
- Mirror-flow discrepancies are shown, not reconciled. India reports $80.2B of exports to
  the US; the US reports $91.0B of imports from India. Both appear, with the 13.4% gap named.
- Zero and not-reported are never merged — they have different colors on the map and
  different treatments in every table.
- Where the source contradicts itself, the affected dashboards say so.
- Opportunity scores show their full arithmetic. A score you cannot audit is an
  unverifiable assertion.

See [.claude/rules/data-integrity.md](.claude/rules/data-integrity.md) for the rules this
follows, and [/about/data](http://localhost:3000/about/data) in the running app for the
live provenance record.

## Not yet built

The FastAPI analytics service, Postgres app state, shared packages, and test suites are
scaffolded directories only. The web app currently reads published JSON directly through
`apps/web/src/lib/data.ts` — the seam where DuckDB goes in when the dataset outgrows
memory. Company-level dashboards remain gated on a data-licensing decision
([docs/PRD.md](docs/PRD.md) §10).
