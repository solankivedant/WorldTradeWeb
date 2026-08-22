# TradeCenter

An interactive world map for global trade: import/export flows, tariffs, money flow between
countries, product-level detail, and a rule-based engine that surfaces business opportunities
from the gaps.

**Status:** V1 running on real data. Map explorer, country / corridor / product
dashboards, tariff explorer, and the opportunity engine are all built and serving live
figures from World Bank WITS.

---

## Read these first

| Document | What it settles |
|---|---|
| [docs/PRD.md](docs/PRD.md) | Scope, personas, V1 vs. V2, success metrics, open questions |
| [docs/TECH_STACK.md](docs/TECH_STACK.md) | Every technology choice and why; what was deliberately excluded |
| [docs/DESIGN.md](docs/DESIGN.md) | UX principles, screen layouts, data model, API surface, opportunity-engine formula |

## Rules — always in force

| Rule | Covers |
|---|---|
| [.claude/rules/data-integrity.md](.claude/rules/data-integrity.md) | Never fabricate figures; provenance; zero ≠ null; HS revisions; mirror flows |
| [.claude/rules/code-style.md](.claude/rules/code-style.md) | TS/Python conventions, naming, commits |
| [.claude/rules/map-performance.md](.claude/rules/map-performance.md) | The 45fps budget and how not to blow it |

## Skills

| Skill | Use when |
|---|---|
| `add-data-source` | Wiring any new upstream dataset into the warehouse |
| `new-dashboard-view` | Adding any page that displays trade figures |
| `dataviz` (built-in) | **Before** writing any chart code, choosing chart colors, or building a KPI tile |

## Agents

| Agent | Use for |
|---|---|
| `data-pipeline-engineer` | ETL, connectors, Polars transforms, HS concordance, wrong-number forensics |
| `map-engineer` | MapLibre/deck.gl, tiles, map performance, picking, LOD |
| `trade-analyst` | Opportunity rules and weights, tariff interpretation, metric correctness, sanity checks |
| `dashboard-builder` | Dashboard screens, charts, tables, states, responsive layout |

---

## What is built

| Route | What it does |
|---|---|
| `/` | Full-bleed map: choropleth, continuous world wrap, metric switch in the header, year scrubber + legends in the footer. Selecting a country draws its directional flows and opens a floating draggable panel |
| `/country/[iso]` | Trade by sector and top partners, each showing **both directions on one row** |
| `/country/[iso]` | KPI row, sector mix, top partners, 13-year series, tariff/concentration/openness |
| `/corridor/[a]/[b]` | Both directions, **mirror-flow comparison**, corridor tariffs, sector overlap |
| `/product/[code]` | Global market for one HS section group — top exporters/importers, HHI |
| `/tariffs` | Applied rates a country charges every partner, sortable and searchable |
| `/opportunities` | Rule-based scoring with a full per-card score breakdown |
| `/about/data` | Sources, units, pipeline stages, build stats, reconciliation warnings |

Real coverage: **190 reporting countries · 48,022 bilateral flows · 16 HS sector groups ·
2010–2022 · ~10,700 tariff pairs.** Country totals match published reality (China $3,594B,
USA $2,062B, India $453B for 2022).

Light and dark themes are both first-class: a single toggle in the header (no "follow the
OS" option, so `data-theme` is always stamped), persisted to localStorage and applied by a
blocking script before first paint so there is no flash. Every surface follows the theme -
header, cards, charts, the floating panel and the map basemap all read the same tokens.
Each theme has its OWN validated categorical palette and its own sequential ramp direction;
neither is derived from the other. Tokens live in `globals.css`, JS-side values in
`lib/palette.ts`, and the two must stay in step.

**Flow direction is green (export) / red (import) by product decision, at near-neon
saturation.** The arcs sit on a blue choropleth, so they have to win against a mid-blue
backdrop rather than a neutral one; muted greens read as blue-green mush over ocean and
land alike. Each arc also gets a wider, softer halo pass of the same hue underneath, which
is what makes a 2px line legible over a saturated background.

Red/green is the one pair colorblind readers struggle with most, so direction is never
carried by colour alone: every flow also has an arrowhead pointing the way the goods
travel, its own separated arc path, a value label, and a matching footer legend. The dark
pair clears every dataviz gate; the light pair measures deutan CVD dE 7.4, which sits in
the documented floor band and is legal ONLY alongside that secondary encoding. If either
pair is changed, re-run `validate_palette.js` against the MAP surface, not the card
surface.
That green/red pair is the app-wide identity for direction - map flows, compare bars, and
the time series all use it. A chart that invents its own pair makes readers relearn the
encoding on every screen.

**Exports and imports are never shown apart.** There is no "exports only" or "imports only"
view anywhere in the product. The map's two lenses are both comparisons (`volume` =
exports + imports, `balance` = exports - imports); the hover tooltip always shows both
sides plus the combined figure; and sector mixes and partner lists put both directions on
one row against a shared centre line (`components/charts/compare-bar.tsx`). The reason is
that a large export number reads as a good number until the import number sits beside it,
and split views make that misreading the default. Pairing helpers live in `lib/pairing.ts`
- NOT in a chart component, because server components build the pairs and anything
exported from a `"use client"` module cannot be called from the server.

**Pairs always rank by TOTAL trade, never by one side.** Ranking by exports silently
reorders a list depending on which direction you happen to be looking at, which is the
split-view problem in another form. And `net` stays null unless both sides are reported -
half a comparison is not a comparison.

**Prose uses plain hyphens, never em or en dashes.** There is a check for this - see the
sweep in the session history if it regresses.

## Repository layout

```
apps/web/          Next.js 15 app — map explorer, dashboards
  src/app/           routes (/country/[iso], /corridor/[a]/[b], /product/[hs])
  src/components/    UI + chart components
  src/lib/           API clients, formatters, map config
  src/hooks/
apps/api/          FastAPI analytics service — opportunity engine, aggregations
packages/shared/   Types and schemas shared across web + api
packages/ui/       Design-system primitives
data/etl/          Pipelines and source connectors
  connectors/        one file per upstream source
  pipelines/         normalize → conform → aggregate → publish
data/raw/          Immutable source dumps + provenance sidecars. Never edited in place
data/processed/    Published datasets the web app reads (JSON today, Parquet when it grows)
data/geo/          ISO code reference, geometry source metadata
db/                Postgres migrations and seeds (app state only, not trade data)
scripts/           One-off and maintenance scripts
tests/e2e/         Playwright
docs/              PRD, tech stack, design, ADRs
```

## Commands

```bash
pnpm install
pnpm dev              # localhost:3000
pnpm build            # production build
pnpm typecheck

# data pipeline — reference first, everything else depends on it
pnpm data:reference                          # World Bank country + indicator reference
pnpm data:fetch  --vintage=2026-08-22        # WITS trade + tariffs (~1500 requests, ~12 min)
pnpm data:build  --vintage=2026-08-22        # conform, validate, publish to data/processed/
pnpm data:geo:prepare                        # fetch + simplify Natural Earth (slow, rarely rerun)
pnpm data:geo                                # -> GeoJSON keyed by ISO3
pnpm data:all    --vintage=2026-08-22        # all four in order
```

The fetch is resumable — it skips any raw file already on disk, so an interrupted run can
just be rerun. `data:build` refuses to publish if validation fails; `--allow-warnings`
overrides, and should be used only after reading what failed.

*Not yet built: the FastAPI analytics service (`apps/api/`), Postgres/Drizzle (`db/`), the
shared packages, and the test suites. Those directories are scaffolding. The web app
currently reads the published JSON directly through `apps/web/src/lib/data.ts`, which is
the seam where DuckDB goes in when the cube outgrows memory.*

---

## Domain facts that cause bugs

Read this before touching data code. The first four were found the hard way, in this
codebase, and each one silently produced plausible-looking wrong numbers.

**Traps actually hit while building V1:**

- **WITS emits superseded ISO codes.** `ROM`→ROU, `SER`→SRB, `SUD`→SDN, `ZAR`→COD,
  `MNT`→MNE, `TMP`→TLS. Requesting the *modern* code returns an empty HTTP 200, which is
  indistinguishable from "does not report" — six real economies vanished from the first
  build. `LEGACY_ISO3` in the pipeline and `ISO3_TO_WITS` in the connector handle both
  directions.
- **A `product/all` response mixes three overlapping classification schemes** — HS section
  groups, UNCTAD stage-of-processing, and ad-hoc aggregates — with no field distinguishing
  them. Summing all 29 codes overstated India's exports 3.4x. Only the 16 HS section groups
  are mutually exclusive. `SECTOR_LABELS` is a whitelist, never a lookup-with-fallback.
- **Aggregate pseudo-countries appear as partner rows** — `WLD`, `ECS`, `NAC`, `SSF`,
  `BUN` (bunkers), Antarctic territories. ~3,500 rows per build. Drop them and *count the
  drops*: the drop log is what surfaced the legacy-code bug.
- **The source contradicts itself.** For a few countries (DOM, GUY) WITS's own sector-level
  and country-level aggregations disagree by 3–11%. Neither is corrected; both are
  published with a visible warning.

**Map and theme traps (also found the hard way):**

- **A hand-rolled TopoJSON decoder is a trap.** Arcs stitched in the wrong order smeared
  Russia and Antarctica into bands across the map. Use a library; the format has too many
  edge cases (arc reversal, quantization deltas, ring winding).
- **`wrapLongitude: true`** on the GeoJsonLayer, or antimeridian-crossing countries smear.
- **`MapView({ repeat: true })`**, or the world ends at the antimeridian and panning east
  runs into empty space.
- **Never nest `@media` inside a selector in `globals.css`.** Nested at-rules need a
  PostCSS nesting plugin that is not in this pipeline; without one the block silently
  fails to compile. That is how "System" theme broke while both explicit toggles still
  looked fine — and why the theme test matrix below exists.
- **Test themes as a MATRIX**: OS-light and OS-dark crossed with light / dark / system.
  Setting `data-theme` directly in a test only exercises the explicit branches and never
  the `prefers-color-scheme` one, which is exactly the branch that broke.
- **Flow arcs are per-country only.** Drawing every corridor at once buried the
  choropleth and was unreadable; drawing only the SELECTED country's top 6 per direction
  is legible and carries labels. Do not go back to a global arc layer.
- **Exports and imports to the same partner share a great circle**, so without separation
  one arc hides the other completely. Two mechanisms, and BOTH are needed: differing
  `getHeight` (exports ride a tall outer arc, imports a shallow inner one) does the real
  work, and opposite `getTilt` keeps short corridors apart where the height gap is too
  small to see. Tilt alone was tried first and barely moved them - tilting rotates the arc
  PLANE, so a near-flat arc has almost no bow to rotate.
- **Arc height is a MULTIPLE of arc length in deck.gl**, not an absolute rise. A fixed
  value makes short corridors barely bow while an India-to-US arc balloons off the top of
  the viewport, so height is damped by span.
- **A tooltip pinned to `x + 14` near the right edge oscillates.** It overflows, the scroll
  width grows, a scrollbar appears, the canvas resizes, deck.gl re-fires hover at new
  coordinates, and the cycle repeats every frame - which reads as the panel vibrating. Two
  independent fixes, because either alone is fragile: the map container clips overflow so a
  tooltip can never change the scroll width, AND the tooltip flips to the other side of the
  cursor near an edge.
- **`pickingRadius` on DeckGL is not optional when arcs are pickable.** A 2px line is close
  to unhittable, and every near-miss falls through to the country underneath, so the
  tooltip flips between the flow and the country as the cursor wobbles.
- **Flow labels stagger along the arc** (`LABEL_STOPS` in `/api/map`). Every flow from one
  country radiates from the same point, so labels at a fixed fraction all pile up near the
  origin. Varying the fraction separates them without a collision pass.
- **Label positions use spherical interpolation, not a lon/lat average.** The arcs are
  great circles; a linear midpoint sits visibly off the drawn path on long routes.
- **Anything theme-dependent in a client component must be gated on `mounted`.** The
  server cannot know the stored theme, and React reconciles children but does NOT patch up
  mismatched ATTRIBUTES - so a `title` or `aria-label` derived from theme state warns on
  every hydration. Render a deterministic placeholder first.

**Standing domain rules:**

- **Country identity is ISO 3166-1 alpha-3** everywhere internally. Convert at ingest, never later.
- **Product codes are strings.** `0901` is coffee; `901` is nothing. Leading zeros matter.
- **Zero ≠ null.** Reported-zero and not-reported must never be coalesced or share a color.
- **Mirror flows disagree** by 10%+ routinely (India→USA is +13.4%). Show both sides.
- **Re-exports inflate totals** for Singapore, Netherlands, Hong Kong, UAE — Hong Kong→China
  is the world's 5th largest corridor and is mostly transit, not production.
- **Trade balance is not a scoreboard.** Deficits are not failures — keep UI copy neutral.
- **HS revisions H0–H6 renumber products.** V1 sidesteps this entirely by using
  revision-stable HS *section groups*. The moment HS-6 detail arrives from Comtrade, the
  concordance problem is real again.
- **Vintage is part of a figure's identity.** Sources revise published figures.

## Architectural commitments

- **Precompute, do not query live.** Everything on a default screen is a lookup from the
  published dataset, loaded once per process and indexed at startup in `lib/data.ts`.
- **Two backends, deliberately.** Next.js Route Handlers as BFF; FastAPI for analytics.
  Rationale and the conditions for collapsing them: [docs/TECH_STACK.md](docs/TECH_STACK.md) §3.
- **`lib/data.ts` is the swap seam.** Today it reads published JSON into memory (a few tens
  of MB, read-only). DuckDB-over-Parquet goes in behind the same function signatures when
  the cube outgrows that — no caller changes.
- **The opportunity engine is rule-based and explainable.** No ML in V1 — every card renders
  its full arithmetic. Weights live in `WEIGHTS`, guardrails in `GUARDRAILS`.
- **Estimates are labeled.** The supply-gap figure is derived, not measured, and carries an
  `est` tag everywhere it appears.
- **URL is the state container.** Every filter combination is a permalink, including the
  selected country (`?focus=CHN`) and the metric (`?metric=balance`, default `volume`).
  The one exception is the floating panel's dragged position, which is a per-view
  convenience, not information.
- **Map boundaries use the Natural Earth India point-of-view edition.** Jammu & Kashmir is
  drawn in full as Indian territory, including Gilgit-Baltistan and Aksai Chin — areas
  claimed by India and administered in practice by Pakistan and China. The whole country
  set comes from that one edition, never patched into a default-edition base, because
  patching leaves neighbours drawing their own version of the same ground and the disputed
  area flickers by draw order. Rationale and the factual note live in
  `data/etl/pipelines/geo.mjs` and on `/about/data`.

## Working agreements

- Ask before adding a dependency that overlaps something already in the stack.
- Write an ADR in [docs/adr/](docs/adr/) when reversing a decision recorded in TECH_STACK.md.
- Performance claims about the map need a profile, not an assertion.
- When a dashboard number looks wrong, suspect the pipeline before the UI — work upstream in
  the order given in the `data-pipeline-engineer` agent.
- Do not run ETL against production data sources without checking rate limits and terms first.

## Known unknown

The brief asks for **company-level dashboards** ("highest selling products of each companies").
Firm-level trade data is largely proprietary (Panjiva, ImportGenius, Volza). V1 assumes
country and product level only; the company layer is V2 and gated on a data decision. See
[docs/PRD.md](docs/PRD.md) §10 question 1 — this is unresolved and affects scope materially.
