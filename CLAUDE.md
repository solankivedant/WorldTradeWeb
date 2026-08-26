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
| `/` | Full-bleed map: choropleth, continuous world wrap, metric switch in the header, year scrubber + legends in the footer. Selecting a country draws its directional flows and opens a floating draggable panel; clicking a flow opens a docked connection panel for that corridor |
| `/explore` | World trade explorer - all 16 sectors at once, a filterable corridor list, and any two connections side by side |
| `/country/[iso]` | Trade by sector and top partners, each showing **both directions on one row** |
| `/country/[iso]` | KPI row, sector mix, top partners, 13-year series, tariff/concentration/openness, plus the context layer below |
| `/corridor/[a]/[b]` | Both directions, **mirror-flow comparison**, corridor tariffs, sector overlap |
| `/product/[code]` | Global market for one HS section group — top exporters/importers, HHI |
| `/tariffs` | Applied rates a country charges every partner, sortable and searchable |
| `/opportunities` | Rule-based scoring with a full per-card score breakdown |
| `/source` | Sources, units, pipeline stages, build stats, reconciliation warnings |

Real coverage: **190 reporting countries + 53 mirror-estimated · 47,241 bilateral flows ·
435,626 corridor-sector slices · 16 HS sector groups · 2010-2023 · ~20,600 tariff pairs.** Country totals match published reality (China $3,380B,
USA $2,019B, Germany $1,726B, India $431B for 2023).

**There is a SECOND trade source now, and it is deliberately not merged.** WITS stops at
2023 and serves only its sixteen section-group codes, so two things are impossible through
it: any year after 2023 (HTTP 404 for every reporter) and any HS chapter (`product/88` is
an HTTP 400). UN Comtrade's public preview endpoint has both, and its USA 2023 totals match
this build exactly - $2,018.5B exports, $3,168.5B imports - so it is the same lineage, not
a competing measurement. It supplies `frontier.json` (country totals for 2024 and 2025) and
`aviation.json` (HS chapter 88), each with its OWN access functions (`frontierFor`,
`aviationFor`), and neither is ever written into `totals.json` or `products.json`. A series
whose 2010-2023 came from WITS and whose 2024 came from Comtrade, with nothing saying so,
is a series where nobody can tell a source change from a real move in trade.

Three traps in that connector, all already paid for:
- **The preview endpoint caps at 500 records per call**, and a capped response is a
  truncated aggregate, not an error. Batches are 80 reporters (~90 rows) and the build
  refuses the vintage if any response came back at the cap.
- **Dimensions must be pinned** (`partner2Code`, `motCode`, `customsCode=C00`). Without
  them one query for ten reporters returned 67 rows fanned across transport-mode and
  customs-procedure, and summing or truncating those is a confidently wrong number.
- **Rows carry `reporterISO: null`.** The preview strips descriptive fields, so the M49
  numeric code MUST be resolved through the Reporters reference file stored in the raw
  drop. A build that read the ISO off the row maps all 255 reporters to nothing.
- **Comtrade values are plain USD.** WITS ships thousands and `build.py` multiplies by
  1000 exactly once. Applying that scaling here would inflate everything a thousandfold.

**Aviation is a SUBSET of Transport, never a seventeenth sector.** HS chapter 88 sits
inside HS section XVII, which is the `86-89_Transport` group already published. Adding it
to the sixteen double-counts every aircraft - the same failure that overstated India's
exports 3.4x when three overlapping WITS schemes were summed. The build proves containment
rather than assuming it: chapter 88 is checked against each country's own Transport figure
(303 comparisons, 2 breaches, both sub-$100M and recorded as warnings), and the UI renders
it nested inside the Transport panel with its share OF that group as the headline.

**"Demand" on the supply-and-demand page means NET IMPORT RELIANCE, not consumption.**
There is no production series in this build, so apparent consumption cannot be computed.
UNIDO INDSTAT is the source that would fix it and is free to a browser, but stat.unido.org
returns 403 to automated requests - the same publisher decision as OEC, and not one to
route around. Even with it, output is ISIC-classified against HS-classified trade and
covers manufacturing only, leaving fuels, minerals and agriculture with no production
figure. Until that is resolved the page says, above the numbers, that a large gap means a
country buys more than it sells and never that it cannot make any.

2023 is the newest year WITS publishes. The frontier moves one year at a time and sits
2-3 years behind the wall clock, because WITS republishes national customs data that
reaches UN Comtrade with a lag - verified against live range queries, 2024 onward returns
nothing for any reporter. To pick up a new year, change `YEAR_TO`/`LATEST` in the WITS
connector and fetch into a NEW raw vintage directory: filenames do not encode the year, and
the fetcher skips files already on disk, so re-running into an existing vintage silently
changes nothing.

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

**Trade is measured at three grains, and they are different aggregations.** Country totals
(`totals.json`), corridor totals (`bilateral.json`), and corridor-by-sector
(`bilateral_sectors.json`, 435k slices) all come from separate WITS aggregations. They
mostly agree - India-China sector slices sum to the corridor total exactly - but nothing in
the pipeline scales one to fit another, and a screen that shows two grains at once should
say which is which. `/explore` reads corridor totals with no sector selected and the sector
cube with one, and says so on the page.

`bilateral_sectors.json` is index-encoded (`codes` array plus `[sectorIndex, usd]` pairs)
because the sector string would otherwise repeat 435,000 times and roughly triple the file.
`codes` ships INSIDE that file: resolve indexes against it, never against `SECTOR_CATALOG`,
or a drift between the two silently relabels every figure. Fetching it costs two extra
requests per reporter (`partner/all` and `product/all` combine in one WITS call), and those
two jobs were added to the EXISTING raw vintage rather than a new one - the fetcher's skip
behaviour meant every already-published figure kept the exact bytes it was derived from.

**About thirty economies file no export report at all, and Russia is one of them.** Any
list built purely from sellers' books therefore has holes shaped like those countries, and
the hole is invisible - the corridor simply is not there, which reads as "no trade" rather
than "nobody published it". Russia is India's largest fuel supplier at $58.7B and was
absent from every flow list until this was fixed. So: prefer the seller's own report, fall
back to the buyer's customs record ONLY for sellers that publish nothing, never for a
reporting country that merely omits one corridor, and label every fallen-back row `BUYER`.
`nonReporters` in `lib/data.ts` is the set; `PartnerValue.src` and `CorridorRow.src` carry
the provenance to the UI. A mirror gap is meaningless on a fallen-back corridor - there is
only one source - so it is null rather than 0%.

**OEC (oec.world) is off limits as a source, and it would add nothing anyway.** Their
terms restrict API / Data Explorer / Bulk Download output to "internal use", which
"explicitly excludes data dissemination to any entity outside of the institutional unit" -
a public site is dissemination - and API access needs a paid Pro/Premium plan. Only their
VISUALIZATIONS are CC0, not the data. Separately, their answer for silent economies is
mirror data rebuilt from partner reports, which is the method already implemented here, so
the licence risk would buy no information. Do not scrape the profile pages; oec.world
returns 403 to automated requests, which is a decision, not an obstacle to route around.

**61 economies file nothing, and 53 of them are reconstructable.** UN Comtrade has nothing
for them either (verified live: RUS and BGD, 2023, HTTP 200 with zero rows) - so there is
no primary source to switch to and mirror derivation is the only honest option. `mirror.json`
holds it, built in `build.py` by inverting every corridor: a reporter's IMPORT record naming
a silent country is one of that country's exports. Russia comes out at $424B from 148
partners, against a real 2023 figure of about $425B.

Three rules keep it from poisoning the reported data:
1. **Its own published file, its own access functions** (`mirrorFor`, `mirrorPartners`), never
   merged into `totals.json` or `products.json`. A caller has to ask for an estimate by name.
2. **Its own page component** (`components/mirror-country.tsx`). Mirror figures never share a
   render path with reported ones, and the method is stated ABOVE the numbers, not in a
   footnote below them.
3. **The partner COUNT ships with every figure**, because it is the only honest measure of
   weight - $424B from 148 partners is a good estimate, the same number from three would be
   a rumour, and nothing else distinguishes them.

Both biases point one way and are stated on the page: trade between two silent economies is
invisible (pushes totals DOWN), and partner records carry the buyer's CIF valuation where the
seller's would be FOB (pushes an estimated export figure UP). Read as a range, not a point.
The 8 with no partner records either are mostly territories counted inside a parent customs
union (Monaco in France, Puerto Rico in the USA) - not missing data, and never a published zero.

**The context layer is everything customs does not measure, and it is kept apart on
purpose.** Twenty-two World Bank WDI series - services trade, FDI, remittances, the four
LPI sub-scores, UNCTAD shipping connectivity, container throughput, lead times, the four
governance estimates, deflator, inflation, exchange rate, real growth - ship in their own
file (`indicators.json`), reached through their own functions (`indicatorsFor`,
`indicatorFamilies`), and rendered by their own component (`components/country-context.tsx`)
under a heading that says what they are not. **None of it may be added to a goods total.**
Services are balance-of-payments data and goods are customs data: different agencies,
different measurement systems, different aggregates. Every series carries a `basis` field
for exactly this, and the page prints it in words.

Three things about that layer that will otherwise bite:

- **Every series has its own frontier year and they are years apart** - services and
  governance reach 2024, goods stop at 2023, LPI at 2022, shipping connectivity at 2021,
  lead times at 2018. The year is printed ON each figure, never inherited from the trade
  data beside it, and a country behind its own series' frontier is told so.
- **`cross_country: false` means rank and median are not computed at all.** The exchange
  rate and the GDP deflator are real over time for one country and meaningless between
  them; a series that does not declare which direction is good gets no rank either. Both
  suppressions live in the published catalogue, not in a component.
- **Direct investment is a NET flow and goes negative.** A negative side is never drawn as
  a clamped bar - that printed `$0` beside a real figure of -$9.4B for Russia. Negative
  rows render as stated signed values labelled "net withdrawal", with no bar.

The catalogue - label, unit, basis, documented range, the explaining sentence - travels
INSIDE `indicators.json`, for the same reason `codes` ships inside `bilateral_sectors.json`.
`lib/indicators.ts` may decide how to render a unit and which glyph a family wears, and
nothing more; it must never restate what a figure means.

**No inventory of non-tariff measures is published, and that is a blocked source, not an
oversight.** WITS's NTM endpoint returns 403, the WTO timeseries API returns 401 without a
subscription key, UNCTADstat has no NTM report code and TRAINS Online is a browser app with
no JSON - all verified live. The LPI customs-clearance score stands in as a labelled PUBLIC
proxy for border friction and counts nobody's certificates or quotas. Do not let it get
described as an NTM count. Corridor freight rates are commercial data and are not licensed;
shipping connectivity is network position, not the cost of any route.

**The sector lens narrows the flows, not just the choropleth.** A filter that repaints the
map but leaves the arcs showing total trade says two different things on one screen, and
the arcs are the louder of the two. When `?sector=` is set the arcs, the labels, the partner
lists AND the panel's headline pair all narrow to it; year-on-year is dropped rather than
faked, because the product cube is latest-year only.

**Direction is never left to colour and a legend.** A ten-row partner list scrolls its
legend off screen by row eight, and on a partner row there are two countries so a bare
"Exports" does not say whose. Every compare row therefore repeats the cue three ways: the
same out-of-a-line / into-a-line arrows the KPI tiles use, sit beside each value; the
legend and the table headers name the reporting country ("India exports to partner",
"Partner exports to India"); and each half of the track carries the full sentence as a
tooltip and in its `aria-label`. `CompareBar`/`CompareLegend` take `exportLabel` and
`importLabel` for exactly this - a caller that leaves them at the default is a caller that
has not said whose trade it is drawing.

`PartnerCompare` has two variants and they are not interchangeable. `corridor` is a
reporting country's partner list: green is the reporter exporting out, red is the partner
exporting back, and the row links to that corridor. `country` is a list of countries
ranked by their own trade in a sector (the product page): the bars are that country's own
two sides and the row links to the country. Rendering the second as the first is how the
product page ended up pointing every row at a corridor with an arbitrary origin, with the
top row linked to itself.

**Flags are SVG files in `public/flags/`, never emoji.** The old `flagEmoji` helper built
a regional-indicator pair and left the OS to draw it; Windows ships no flag glyphs, so
every flag in the product silently degraded to a bare two-letter code. `CountryFlag`
serves a local file keyed by lowercase ISO 3166-1 alpha-2, is server-component safe, and
falls back to the ISO letters in a same-sized box for territories with no published flag
(Channel Islands). Refresh the set with `node scripts/fetch-flags.mjs` - it skips files
already on disk and writes a provenance sidecar. Nothing on a page reaches an external
host at runtime, and flags must not be the exception.

**One rate, one colour, across the whole tariff page.** The band edges, labels, ramp and
per-band ink all come from `tariffBands` / `TARIFF_BAND_META` in `lib/palette.ts`. The
distribution columns, the region bars, the table pills and the band filter all read them,
because when each surface restated its own edges "Elevated" meant one blue in the chart
and a different one in the table three cards down. The ramp is ORDINAL - one hue, monotone
lightness, stepped per surface - and both directions clear the dataviz ordinal checks;
re-run `validate_palette.js --ordinal` against the right surface if either is touched.
`ink` is measured, not chosen: the mid-blues sit on the 4.5:1 boundary, so a rate can only
be printed ON its band colour with the ink the table records. Duty-free stays the reserved
status-good colour because an agreement being in force is a different kind of fact from a
small number.

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
pnpm data:context                            # World Bank context layer (22 series, skips if on disk)
pnpm data:fetch  --vintage=2026-08-22        # WITS trade + tariffs (~1500 requests, ~12 min)
pnpm data:build  --vintage=2026-08-22        # conform, validate, publish to data/processed/
pnpm data:comtrade --vintage=2026-08-26      # second source: 2024/2025 totals + HS 88 (16 requests)
pnpm data:comtrade:build --vintage=2026-08-26   # -> frontier.json, aviation.json
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
  `data/etl/pipelines/geo.mjs` and on `/source`.

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
