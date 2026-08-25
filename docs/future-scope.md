# Future scope

What TradeCenter could become after V1. This is a candidate list, not a roadmap - nothing
here is committed, and several items are gated on a data decision rather than on
engineering time.

V1 as it stands: map explorer, country / corridor / product / tariff dashboards, the
rule-based opportunity engine, and a provenance page, all serving World Bank WITS figures
for 2010-2023 across 190 reporters plus 53 mirror-estimated economies. Everything below is
measured against that baseline.

Each item carries a rough size (S / M / L), and where relevant, what blocks it.

---

## 1. Promised in the PRD, not yet built

These are the smallest wins because the scope is already settled - see
[PRD.md](PRD.md) 4.1 G, "Cross-cutting".

| Item | Size | Notes |
|---|---|---|
| **One search bar for anything** - country name, ISO code, sector, HS section | M | The PRD calls the map "never the only path". Today the only entry points are the map and hand-typed URLs. Needs a small client-side index over the country list plus `SECTOR_CATALOG`; no new data. |
| **CSV export on every table** | S | Corridor lists, partner lists, the tariff table, opportunity cards. The values are already in memory server-side; a route handler that streams the same rows the page rendered keeps the figure and the download identical by construction. |
| **PNG export on every chart** | M | Harder than CSV because charts are a mix of SVG and deck.gl canvas. Export must burn in the source, vintage and units, or a screenshotted chart loses its provenance the moment it leaves the site. |
| **Mobile map** | M | Dashboards are responsive; the map is not meaningfully usable on a phone. The PRD's stated answer is "degrades to a simplified interactive view" - probably a country list plus choropleth with the arcs off. |
| **Keyboard path through the map** | M | Accessibility requirement in PRD 7. Tab through countries by rank, Enter to select, arrows to move between flows. |

## 2. Data the warehouse does not have yet

Every one of these is an `add-data-source` job: connector, five pipeline stages, Pandera
validation, provenance record. The skill covers the shape; the interesting part is what
each one unlocks.

### 2.1 HS-6 product detail (L, high value, highest risk)

Today the product grain is 16 HS section groups. That is deliberate - section groups are
revision-stable, so the 2010-2023 series needs no concordance. HS-6 from UN Comtrade would
take the product page from "Chemicals" to "HS 300490, medicaments in dosage form", which is
the grain an actual exporter thinks in.

The cost is that **HS revisions H0-H6 become load-bearing the day this lands**. Codes are
renumbered between revisions, so any multi-year HS-6 series must either pin one revision or
route through a concordance table, and doing neither produces confidently wrong trends. See
[.claude/rules/data-integrity.md](../.claude/rules/data-integrity.md). Budget the
concordance as its own piece of work, not as a detail of the connector.

Volume also changes the storage answer: 16 sectors x 47k corridors is 435k slices and fits
in memory. HS-6 is orders of magnitude more rows, which is where the DuckDB-over-Parquet
swap behind `lib/data.ts` stops being hypothetical.

### 2.2 Monthly and quarterly series (M)

Annual data means the newest figure is 2023 and the frontier moves once a year. Comtrade
publishes monthly for many reporters. Monthly would make "is this corridor growing right
now" answerable, and would make a watchlist worth having. It also multiplies the row count
by 12 and introduces seasonality, which every trend line and the opportunity engine's
growth term would have to handle explicitly rather than by accident.

### 2.3 WTO Tariff Download Facility (M)

WITS gives applied rates. WTO TDF is authoritative for **MFN and bound** rates, and the gap
between applied and bound is itself information: a country applying 5% against a 40% bound
rate has 35 points of legal headroom to raise it, which is a risk an exporter should see on
the corridor page.

### 2.4 Trade agreements and rules of origin (M for the agreement list, L for RoO)

The tariff page shows what a country charges. It does not show *why* - whether a duty-free
rate comes from an FTA, GSP, or an MFN schedule. An agreement layer would let the corridor
page say "this rate exists because of RCEP" and let the opportunity engine flag markets
where an agreement is about to enter force. Rules of origin (does a product with 40%
imported content still qualify) are a much larger and more legalistic dataset, and the
product must keep saying it displays rates rather than certifying classifications.

### 2.5 Non-tariff measures (L) - PARTLY SHIPPED, the inventory is BLOCKED

For many products the binding constraint is not the duty - it is a sanitary certificate, a
CE mark, or a quota. This remains the single biggest "the number said go, reality said no"
gap in the opportunity engine.

**The NTM inventory is not publicly reachable.** Four routes were tried live and all four
close: the WITS NTM SDMX endpoint returns 403, the WTO timeseries API returns 401 without a
subscription key, UNCTADstat has no NTM report code, and TRAINS Online serves a browser
application with no JSON behind it. Registering for a WTO API key is the unblock, and it is
a decision for whoever owns the account, not something the pipeline can route around.

**What shipped instead:** the LPI customs-clearance sub-index, as the closest PUBLIC read
on border friction. It is labelled on the page as a perception score and explicitly not an
NTM count - it counts nobody's certificates, quotas or standards. Do not let it drift into
being described as one.

### 2.6 Services, FDI and remittances (L) - SHIPPED, country level only

Services trade, direct investment and remittances now ship from the World Bank WDI
balance-of-payments series, on the country page and the mirror page. They run to 2024,
a year ahead of the goods data.

Built as a parallel data model exactly as this section predicted: their own published file
(`indicators.json`), their own access functions, their own page section, and a `basis` field
on every series that the UI prints in words. Nothing adds them to a goods total, because
balance-of-payments and customs are different measurement systems.

Still open: there is **no bilateral breakdown**. Who a country sells services TO is not in
this source, so services cannot appear on a corridor page. The WTO-UNCTAD-ITC balanced
services dataset is the next step if that matters.

### 2.7 Freight cost and lead time (M) - PUBLIC PART SHIPPED, rates still unlicensed

Landed cost is tariff plus freight, and a 3% duty advantage disappears against a container
rate.

**Shipped:** UNCTAD's Liner Shipping Connectivity Index (to 2021), container port throughput
in TEU (to 2024), and median lead times to export and import (to 2018) - all country-level,
all carrying their own year on the tile because those three frontiers are years apart.

**Still not licensed:** corridor-level freight rates. Drewry, Xeneta and the rest are
commercial. The page says plainly that connectivity describes a country's place in the
network and not the cost of shipping anything, which is the honest limit of a public index.

### 2.8 More context indicators (S each) - SHIPPED

Twenty-two series now ship alongside GDP and population: the four Logistics Performance
Index sub-scores, the four Worldwide Governance Indicators, the GDP deflator, CPI inflation,
the exchange rate and real GDP growth.

Three things worth knowing before touching them:

- **The WGI codes moved.** `RL.EST`, `GE.EST` and the rest now live in "WDI Database
  Archives" and return HTTP 200 with an error body, which looks exactly like a country that
  does not report. The live codes are `GOV_WGI_<pillar>_EST`, and `&source=3` is rejected
  outright so the archive is not reachable either.
- **Doing Business is gone**, not frozen. `IC.EXP.TMBC*` and the ease-of-doing-business
  score were withdrawn when the programme was discontinued in 2021.
- **Two series carry `cross_country: false`.** The exchange rate and the GDP deflator are
  real for one country over time and meaningless between countries - ranking exchange rates
  puts the yen above the euro because a yen is worth less. Rank and median are suppressed
  for them rather than computed, and a series whose good direction is undeclared gets no
  rank at all.

Deflating the nominal series is still open. The deflator is now published; nothing yet uses
it to show a constant-dollar trade line.

## 3. New views and features

| Feature | Size | What it needs |
|---|---|---|
| **Watchlists and alerts** | M | PRD 4.2. Meaningful only once the data moves more than once a year, so it pairs with monthly series (2.2) or with a tariff-change feed. Also the first feature that needs accounts, and therefore the Postgres layer in `db/` that is currently scaffolding. |
| **Saved views and shareable reports** | M | Half of this is already free: URL is the state container, so every filter combination is a permalink. What is missing is naming a view, collecting several into a report, and annotating them. |
| **Country comparison view** | S | `/explore` compares two corridors. There is no way to put two countries side by side on sector mix, tariffs and concentration. Cheap, and it reuses `CompareBar` and the existing pairing helpers. |
| **Scenario / what-if tool** | M | "If the US raises its rate on HS 87 to 25%, which corridors move?" Purely arithmetic on data already published, and it is the most direct answer to the tariff news cycle. Must be labelled an estimate as loudly as the supply-gap figure is. |
| **Partner-dependency view** | M | Which economies depend on a single partner for a critical sector, and how concentrated that is. HHI is already computed for products; the same measure across partners is the supply-chain-risk read. Keep the copy neutral - a deficit is not a failure. |
| **Time-lapse playback on the map** | M | 2010-2023 as an animation. The map-performance rule already dictates the implementation: prefetch adjacent years and interpolate, never fetch per frame, and cut rather than tween under `prefers-reduced-motion`. |
| **Guided tours / annotated stories** | M | A short scripted path through the map and dashboards ("how India's pharma exports moved, 2010-2023"). This is the answer to the "time to first insight under 60s" metric for a visitor who does not yet know where to click. |
| **Per-figure "explain this number"** | S | `/source` explains the pipeline globally. A per-figure popover - which aggregation grain, which vintage, reported or mirror-estimated - would put provenance at the point of doubt instead of one page away. |

## 4. The opportunity engine

V1 is rule-based and explainable by design: every card renders its full arithmetic, weights
live in `WEIGHTS`, guardrails in `GUARDRAILS`. That constraint should survive everything
below.

- **More rules, same explainability** (M). Candidates: applied-versus-bound headroom
  (2.3), agreement-driven rate changes (2.4), incumbent supplier concentration, unit-value
  gaps as a proxy for quality tiers.
- **Sensitivity display** (S). Show how a card's rank moves when a weight changes. Today
  the weights are visible but their influence is not, and a reader cannot tell whether a
  card is robustly ranked or sits on a knife edge.
- **User-adjustable weights** (M). Let the reader say they care more about tariff than
  growth, and re-rank live. Pairs naturally with saved views.
- **Backtesting** (L). Score with data through 2018, then check what actually grew by 2023.
  This is the only thing that turns the weights from plausible into calibrated, and it is
  also the prerequisite for the labelled outcome data that [TECH_STACK.md](TECH_STACK.md) 9
  names as the condition for ML entering the engine at all. Do this before, and instead of,
  any model.
- **A stated disclaimer surface** (S). PRD 9 lists "opportunity scores read as financial
  advice" as a liability risk. The score breakdown does most of that work; the statement
  itself should not be left implicit.

## 5. Platform and engineering

- **`lib/data.ts` to DuckDB over Parquet** (M). The seam exists and the function signatures
  are meant to survive the swap. Forced by 2.1 or 2.2, not before.
- **The FastAPI service in `apps/api/`** (M). Scaffolding today; the opportunity engine runs
  in the web app. TECH_STACK 3 records the two-backend rationale and the conditions for
  collapsing it. If nothing ever needs Python analytics, the honest move is an ADR reversing
  that decision, not indefinite empty directories.
- **Test suites** (M). `tests/e2e/` is empty. The theme matrix (OS-light and OS-dark crossed
  with light / dark / system) is written up in CLAUDE.md precisely because it broke once,
  and nothing currently prevents it breaking again. Pipeline validation is Pandera-covered;
  the UI is not covered at all.
- **PMTiles for country geometry** (M). The map-performance rule specifies geometry loading
  once as tiles and staying cached, separate from the data join. Profile the current path
  first - a perf claim here needs a trace, not an assertion.
- **Automated vintage refresh** (S). Fetching a new year is a manual four-command sequence
  with a real footgun: filenames do not encode the year and the fetcher skips files already
  on disk, so re-running into an existing vintage silently changes nothing. A scripted
  refresh that always creates a new vintage directory removes the trap.
- **Reconciliation dashboard** (S). `/source` shows warnings where WITS contradicts itself.
  Tracking those disagreements across vintages would show whether a source is stabilising or
  drifting.

## 6. Gated on a data decision

**The company layer.** The original brief asks for per-company dashboards and
highest-selling products per company. Firm-level trade data is largely proprietary
(Panjiva, ImportGenius, Volza). PRD 10 question 1 is still open, and the working assumption
is country and product level for V1 with a thin public-filings experiment as a V2 probe.
The three paths, unchanged:

1. Country and product level only. What ships today.
2. License a firm-level dataset. Solves it properly, costs money, and adds a redistribution
   constraint that has to be checked against a public site before anything is built on it.
3. Derive a thin layer from public filings for large listed exporters. Cheap and legal,
   covers a small and biased slice of firms, and segment reporting is nothing like customs
   data in grain or comparability.

Until that is decided, do not half-build it. A company page populated from an unlicensable
source is worse than no company page.

**OEC remains off limits as a source.** Their terms restrict API / Data Explorer / Bulk
Download output to internal use, which explicitly excludes dissemination outside the
institutional unit - a public site is dissemination - and API access needs a paid plan.
Only their visualizations are CC0, not the data. Their answer for silent economies is
mirror data rebuilt from partner reports, which is the method already implemented here, so
the licence risk would buy no information. This is settled, not pending.

## 7. Deliberately still out of scope

From PRD 4.3, unchanged and worth restating so they do not creep back in as "small
additions":

- Customs brokerage, shipment booking, or acting as a marketplace.
- Real-time (sub-daily) data. Trade statistics are lagged at best by months; the annual
  frontier sits 2-3 years back. No engineering makes the source faster.
- Legal or compliance advice on tariff classification. Rates are displayed, never certified.
- Firm-level shipment records without a licensed source.
- ML in the opportunity engine before there is labelled outcome data and an explainability
  story. See 4, backtesting.

## 8. Still-open product questions

Carried forward from PRD 10, because they shape which of the above is worth doing first:

1. **Company scope** - decide between the three paths in 6. Materially affects everything.
2. **Launch geography** - global from day one, or depth-first on one region (India plus
   ASEAN) to prove the opportunity engine before widening.
3. **Monetization** - free and open, freemium on the engine and exports, or B2B seats. This
   one decides whether accounts, and therefore watchlists and saved views, are worth
   building at all.
4. **Does money flow include services** - see 2.6. Goods-only today, and the product should
   probably say so more plainly until it is settled.
