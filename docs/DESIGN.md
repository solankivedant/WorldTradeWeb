# Design — TradeCenter

**Status:** Draft v0.1
**Last updated:** 2026-08-22

Covers product/UX design and system design. Visual specifics stay directional until the first prototype lands.

---

## Part I — Product design

### 1. Design principles

1. **The map is a control, not decoration.** If a map view cannot be clicked into something more specific, it should not be on screen.
2. **Every number is traceable.** Source and vintage are one hover away, always. This product's only real asset is trust in its figures.
3. **Progressive disclosure.** World → country → corridor → product → HS-6 line. Each level answers a question and offers exactly one obvious next question.
4. **Explain, do not oracle.** Opportunity scores show their arithmetic. A user who disagrees with a score should be able to see precisely which input they disagree with.
5. **Data density with breathing room.** These are analyst tools — dense is fine, cluttered is not. One primary insight per screen region.
6. **Charts and tables are peers.** Every chart has a table behind a toggle. It serves accessibility, and analysts want to copy numbers.

### 2. Information architecture

```
/                          Map explorer (default view, world exports, latest year)
/country/[iso]             Country dashboard
/corridor/[iso-a]/[iso-b]  Bilateral corridor dashboard
/product/[hs]              Product dashboard
/tariffs                   Tariff explorer
/opportunities             Opportunity engine
/compare                   Side-by-side (countries or products)
/source                    Sources, methodology, caveats
```

All view state lives in URL params — `?year=2024&hs=8703&flow=export&mode=arcs` — so every screen is shareable and back/forward works.

### 3. Screen layouts

**Map explorer**

```
┌──────────────────────────────────────────────────────────────┐
│ TradeCenter    [ search countries · products · HS codes ]  ⊙ │
├────────────┬─────────────────────────────────────────────────┤
│            │                                                 │
│  FILTERS   │                                                 │
│            │                MAP CANVAS                       │
│  Year   ▾  │        (choropleth or flow arcs)                │
│  Flow   ▾  │                                                 │
│  Product▾  │                              ┌────────────────┐ │
│  Metric ▾  │                              │ HOVER CARD     │ │
│            │                              │ Vietnam        │ │
│  ── Legend │                              │ Exp $384B      │ │
│  ▓▓▓▓▓▓    │                              │ Imp $361B      │ │
│            │                              │ Bal +$23B      │ │
│            │                              └────────────────┘ │
│            ├─────────────────────────────────────────────────┤
│            │ ◀ 2015 ──────────────●─────────── 2025 ▶  ▶play │
└────────────┴─────────────────────────────────────────────────┘
```

Left rail collapses. On mobile, filters become a bottom sheet and the timeline docks above it.

**Country dashboard**

```
┌──────────────────────────────────────────────────────────────┐
│ ← Map    🇮🇳 India                        [2024 ▾]  [export] │
├──────────────────────────────────────────────────────────────┤
│ ┌────────┐┌────────┐┌────────┐┌────────┐                    │
│ │Exports ││Imports ││Balance ││ Rank   │   KPI row           │
│ │$778B   ││$898B   ││-$120B  ││ #17    │                    │
│ │▲ 6.2%  ││▲ 4.1%  ││        ││        │                    │
│ └────────┘└────────┘└────────┘└────────┘                    │
├───────────────────────────────┬──────────────────────────────┤
│ TOP EXPORT PRODUCTS           │ TOP PARTNERS                 │
│ (treemap, click → product)    │ (bar list, click → corridor) │
├───────────────────────────────┴──────────────────────────────┤
│ TRADE BALANCE — 10 YEAR (dual-line + area)                   │
├───────────────────────────────┬──────────────────────────────┤
│ TARIFF PROFILE                │ OPPORTUNITIES FROM HERE      │
│ avg applied · protected sect. │ top 5 cards → /opportunities │
└───────────────────────────────┴──────────────────────────────┘
```

Corridor and product dashboards follow the same skeleton: KPI row → two-column detail → full-width time series → cross-links.

**Opportunity card**

```
┌────────────────────────────────────────────┐
│ ⬤ 87   Pharmaceuticals → Brazil            │
│        HS 3004 · underserved market        │
├────────────────────────────────────────────┤
│ Brazil imports $4.2B/yr of HS 3004.        │
│ India supplies 3.1% of it.                 │
│ India's world share of HS 3004 is 18.4%.   │
│ Applied tariff on India: 8% (MFN).         │
│ Demand CAGR (5yr): +7.3%                   │
├────────────────────────────────────────────┤
│ Score = demand(30) + gap(28) + capability  │
│         (21) + tariff(8) = 87              │
├────────────────────────────────────────────┤
│ [see corridor]  [see product]  [export]    │
└────────────────────────────────────────────┘
```

The score breakdown is not optional detail — it is the feature. Without it the card is an unverifiable assertion.

### 4. Visual language

**Color.** Trade data has two natural encodings that must not collide:
- **Sequential** (volume, value) — single-hue ramp, light to dark.
- **Diverging** (trade balance, surplus/deficit) — two-hue ramp with a neutral zero. Use a colorblind-safe diverging pair, not red/green.
- **Categorical** (product sectors, partner groups) — a fixed palette capped at 8 visible categories plus "Other." Sector-to-color mapping stays stable across the whole app so users learn it.

Flow arcs encode direction with a gradient (origin → destination), value with width, and never with color — color is reserved for the sector.

**Typography.** One sans for UI (Inter or similar). **Tabular figures everywhere numbers appear** — misaligned digits in a trade table are a real usability failure.

**Theme.** Dark map / light map both supported. **Light is the default**, so a first-time visitor opening a shared link lands in light; only an explicit toggle stores `dark`. Arcs do read better on dark, which is why the near-neon export/import pair exists - it has to survive the light basemap too. Chart palettes are defined per theme, not auto-inverted.

**Motion.** Arc animation is directional and slow (its job is showing direction, not drawing attention). Year transitions are interpolated, not cut. Respect `prefers-reduced-motion` — all animation becomes a static frame.

> Before building any chart in this project, load the `dataviz` skill. It carries the palette formula, mark specs, and the accessibility validator this section is only summarizing.

### 5. Empty, loading, and error states

| State | Treatment |
|---|---|
| Loading map | Skeleton geometry, then data fade-in — never a spinner over a blank world |
| No data for a country/year | Country renders in a distinct hatched neutral, not the zero color. Zero and unknown must never look the same |
| Mirror discrepancy | Show both reported figures with a badge and a plain-language explainer |
| Empty opportunity result | Say which filter is too narrow and offer to widen it |
| Stale data | Persistent vintage badge, e.g. "Comtrade, 2024 annual, retrieved 2026-08-01" |

---

## Part II — System design

### 6. Data model (core)

```
countries        iso3 (PK) · iso2 · name · region · income_group · geometry_id
products         hs_code (PK) · hs_revision · level · description · parent · sector
trade_flows      year · reporter_iso · partner_iso · hs_code · flow(exp|imp)
                 · value_usd · quantity · unit · source · vintage
tariffs          year · reporter_iso · partner_iso · hs_code · rate_type(mfn|pref|bound)
                 · applied_rate · agreement_id · source
agreements       id (PK) · name · type · members[] · in_force_from
indicators       year · iso3 · indicator_code · value      (GDP, population, WDI)
hs_concordance   from_rev · from_code · to_rev · to_code · weight
```

`trade_flows` is the cube — Parquet, partitioned `year/reporter_iso`. Everything else is small enough for Postgres and is mirrored into the cube for joins.

**The concordance table is load-bearing.** HS revisions H0–H6 renumber products. Any multi-year query that ignores it produces plausible-looking wrong trends. Rule: a view either pins one HS revision or passes explicitly through the concordance — never neither.

### 7. Precomputation strategy

Query latency targets are met by precomputing, not by optimizing at request time. ETL publishes these materialized tables:

| Table | Grain | Serves |
|---|---|---|
| `agg_country_year` | country × year × flow | Country KPI row, choropleth |
| `agg_corridor_year` | pair × year × flow | Arc layer, corridor headline |
| `agg_country_product` | country × HS4 × year × flow | Top-products treemap |
| `agg_product_global` | HS4 × year | Product dashboard |
| `mv_opportunities` | origin × destination × HS4 | Opportunity engine |

The only live-computed queries are HS-6 drill-downs and custom comparisons. Everything on a default screen is a lookup.

### 8. API surface (v1)

```
GET /api/map/choropleth?year&metric&hs&flow
GET /api/map/flows?year&hs&min_value&limit
GET /api/country/{iso}?year
GET /api/country/{iso}/products?year&flow&level
GET /api/corridor/{a}/{b}?year
GET /api/product/{hs}?year
GET /api/tariffs?reporter&partner&hs&year
GET /api/opportunities?origin&sector&min_market&limit
GET /api/search?q
```

Conventions: cursor pagination on lists; every response carries a `meta` block with `source`, `vintage`, and `caveats`; `Cache-Control` is long since the data is a snapshot, invalidated by ETL publishing a new vintage.

### 9. Map rendering strategy

The performance problem is arcs, not polygons. Approach:

1. **Country polygons** — PMTiles from static storage, simplified per zoom. Fill color driven by a data join on the client so a filter change repaints without refetching geometry.
2. **Flow arcs** — deck.gl `ArcLayer`, one GPU draw call. Server returns a compact array (origin lon/lat, dest lon/lat, value, sector), not GeoJSON.
3. **Level of detail** — at world zoom, cap to the top N corridors by value; as the user zooms into a region, request the corridors touching that bounding box. Never ship 50k arcs to render 200 visible ones.
4. **Hover** — deck.gl picking, not geometry hit-testing on the CPU.
5. **Year animation** — prefetch adjacent years, interpolate arc widths between frames rather than re-requesting per tick.

### 10. Opportunity engine

Rule-based and explainable. Each rule emits a component score and a human-readable reason; the card shows the sum and the parts.

```
score = w1·demand_size      (destination import value for HS, log-scaled)
      + w2·supply_gap        (origin's share of that import, inverted)
      + w3·origin_capability (origin's world export share for HS)
      + w4·tariff_advantage  (origin's rate vs. competitors' average)
      + w5·growth            (destination import CAGR, 5yr)
      − p1·concentration_penalty (incumbent supplier lock-in)
```

Weights live in config, not code, so they can be tuned without a deploy. Every emitted opportunity stores its input values, so a card rendered today can be audited against the data vintage it used.

**Guardrails:** minimum market size floor (filters noise), minimum origin capability (no suggesting a country export something it has never made), and a disclaimer that these are statistical signals rather than investment advice.

### 11. Sequence — country dashboard load

```
Browser              Next.js RSC          Redis          FastAPI         DuckDB
   │  /country/IND      │                   │               │              │
   ├───────────────────>│                   │               │              │
   │                    │  GET dash:IND:24  │               │              │
   │                    ├──────────────────>│               │              │
   │                    │       miss        │               │              │
   │                    ├──────────────────────────────────>│              │
   │                    │                   │               │ agg_* lookup │
   │                    │                   │               ├─────────────>│
   │                    │                   │               │<─────────────┤
   │                    │<──────────────────────────────────┤              │
   │                    ├── SET (24h) ─────>│               │              │
   │<─── streamed HTML ─┤                   │               │              │
   │  (KPIs first, charts hydrate after)    │               │              │
```

### 12. Open design questions

1. Does the map default to choropleth (calmer, more readable) or flow arcs (more striking, the product's signature)? Test both on first-time users.
2. How much of the opportunity score belongs on the card versus behind a "show working" toggle? Full transparency risks overwhelming the SMB persona.
3. Do corridor dashboards default to net balance or to gross both-directions? Analysts want gross; newcomers understand net.
4. Should sector color assignments be fixed globally, or contextual per view? Fixed aids learning but wastes palette range on views with few sectors.
