# Product Requirements Document — TradeCenter

**Status:** Draft v0.1
**Owner:** Vedant Solanki
**Last updated:** 2026-08-22

---

## 1. Problem

Global trade data exists but is unusable for decision-making. UN Comtrade, WITS, WTO tariff schedules, and IMF DOTS each publish partial slices in different formats, code systems, and update cadences. Anyone asking a practical question — *"what does Vietnam import from India, at what tariff, and where is the gap I could fill?"* — has to stitch together five sources, reconcile HS code revisions, and build their own charts.

There is no single interactive surface that connects **flows → tariffs → products → opportunity**.

## 2. Product vision

An interactive world map where every country, corridor, and product is clickable, and every click drills into a dashboard that answers a real trade question. The map is the navigation; the dashboards are the substance; the opportunity engine is the payoff.

## 3. Target users

| Persona | Need | Success signal |
|---|---|---|
| **Export SMB owner** | "Which country should I sell to next?" | Shortlists 3 target markets in one session |
| **Trade analyst / consultant** | Fast corridor + tariff research, exportable | Replaces a half-day of manual data pulls |
| **Sourcing / procurement lead** | "Where can I buy this cheaper post-tariff?" | Finds an alternate supplier country |
| **Student / journalist / policy** | Explain a trade relationship visually | Shares a permalinked map view |
| **Investor / strategist** | Sector and corridor trend spotting | Tracks corridors on a watchlist |

## 4. Scope

### 4.1 In scope (V1)

**A. Interactive world map**
- Choropleth mode: color countries by total exports, imports, trade balance, or a chosen product's flow.
- Flow mode: animated arcs between country pairs; width = trade value, direction = flow.
- Filters: year, HS product (2/4/6-digit), direction (import / export / net), value vs. volume.
- Time scrubber for year-over-year animation.
- Click a country → country dashboard. Click an arc → corridor dashboard.
- Permalinkable view state: every filter combination is a URL.

**B. Country dashboard**
- Headline: total exports, imports, balance, YoY change, world rank.
- Top 10 export products and import products (HS-coded, treemap + table).
- Top 10 trading partners in each direction.
- Trade balance time series (10+ years).
- Tariff profile: average applied tariff, MFN vs. preferential, most protected sectors.
- Trade agreements the country is party to.
- Export diversification / product complexity indicator.

**C. Corridor (country-pair) dashboard**
- Bilateral trade value in both directions, balance, 10-year trend.
- Product composition of each direction.
- Tariffs A charges B and B charges A, by sector.
- Applicable trade agreement and the preferential rates it grants.
- Gap analysis: what B imports heavily from the world but *not* from A.

**D. Product dashboard**
- Global trade value for an HS code; top exporters and importers.
- Unit-value spread across exporting countries.
- Tariff heatmap: what each importing country charges on this product.
- Growth trend and market concentration (HHI).

**E. Tariff explorer**
- Look up product × exporting country × importing country → applied rate, MFN rate, preferential rate, and the agreement granting it.
- Compare one product's tariff across candidate destination markets side by side.

**F. Opportunity engine**
- Rule-based scoring that surfaces openings such as:
  - Destination imports product P heavily, origin exports P competitively, current bilateral share is low → **underserved market**.
  - Destination's dominant supplier faces a rising tariff or a falling share → **displacement opportunity**.
  - Origin holds a preferential rate a competitor lacks → **tariff arbitrage**.
  - Import demand growing above a CAGR threshold while global supply is concentrated → **growth gap**.
- Each opportunity card shows score, why it triggered, the supporting data, and links to the underlying dashboards. **Every score is explainable — no black box.**
- Filter opportunities by origin country, sector, and minimum market size.

**G. Cross-cutting**
- One search bar for anything: country, product name, or HS code.
- Export any chart as PNG and any table as CSV.
- Data-provenance panel on every view: source, vintage, known caveats.

### 4.2 In scope (V2)

- **Company layer** — dashboards for major exporters and importers: product mix, destination markets, revenue by geography. *(Gated on data availability — see Open Questions.)*
- Watchlists and alerts on corridor or tariff changes.
- Saved views and shareable reports.
- Freight-cost and lead-time overlays.
- Non-goods flows (services, FDI, remittances) in the money-flow layer.

### 4.3 Explicitly out of scope

- Customs brokerage, shipment booking, or acting as a marketplace.
- Real-time (sub-daily) data — trade statistics are inherently lagged 1–6 months.
- Legal or compliance advice on tariff classification. We display official rates; we do not certify them.
- Firm-level shipment records unless a licensed source is acquired.

## 5. Key flows

**Flow 1 — Explore.** Land on the map → default view (world exports, latest year) → click India → country dashboard → click "Electronics" → product view filtered to India → click Vietnam in top partners → corridor dashboard.

**Flow 2 — Targeted opportunity.** Select "I export from India, sector: pharmaceuticals" → the opportunity engine returns ranked destination markets → open a card → see the tariff, the incumbent supplier, the demand trend → export to CSV.

**Flow 3 — Tariff check.** Search "HS 8703" → product dashboard → tariff heatmap → compare rates across 5 candidate destinations → see which trade agreement changes the answer.

## 6. Success metrics

| Metric | V1 target |
|---|---|
| Time to first meaningful insight | under 60s from landing |
| Map interaction to dashboard drill-down rate | above 50% of sessions |
| Median session depth | 4+ dashboard views |
| Opportunity card to underlying-data click-through | above 30% |
| Map frame rate (10k arcs, mid-range laptop) | 45+ fps |
| Dashboard p95 load | under 1.5s |
| Week-4 return visitors | above 20% |

## 7. Non-functional requirements

- **Performance:** map interactions feel instant. Heavy aggregates are precomputed, never computed per request.
- **Data integrity:** every number traceable to a source and vintage. Mirror-flow discrepancies (A's reported exports to B ≠ B's reported imports from A) are surfaced, not hidden.
- **Accessibility:** the map is never the only path — every view is reachable by search and keyboard. Colorblind-safe palettes. Every chart has a table equivalent.
- **Mobile:** dashboards fully responsive; the map degrades to a simplified interactive view.
- **Cost:** static-first. Precomputed tiles and aggregates beat live heavy queries.

## 8. Data sources

| Source | Provides | Cadence | Notes |
|---|---|---|---|
| UN Comtrade | Country totals past the WITS frontier (2024, 2025) and HS chapter 88 (aircraft) | Annual, lagged | **In use.** Public preview endpoint, no key: 500 records per call and a hard rate limit, so reporters are batched 80 per request and dimensions are pinned. Own published files (`frontier.json`, `aviation.json`), never merged into the WITS series. Licence permits re-disseminating transformed/derived data; no bulk export of original records is offered |
| World Bank WITS | Bilateral goods trade, sector cube, tariffs | Annual, to 2023 | **In use.** The core dataset. Wraps TRAINS + Comtrade. Stops at 2023 - 2024 onward returns HTTP 404 for every reporter - and serves only its sixteen section-group codes, so `product/88` is an HTTP 400 |
| WTO Tariff Download Facility | MFN and bound tariff schedules | Annual | Authoritative for MFN rates |
| IMF DOTS | Direction of trade, aggregates | Quarterly | Good for balance sanity checks |
| World Bank WDI | GDP, population, context | Annual | Normalization denominators |
| World Bank WDI - services and BoP | Services trade, FDI, remittances | Annual, to 2024 | **In use.** Balance-of-payments basis, never summed with the customs goods figures |
| World Bank WDI - LPI | Logistics, customs efficiency, infrastructure, timeliness | Every 2-4 years, to 2022 | **In use.** Survey of freight forwarders; ordinal, not a measurement |
| UNCTAD LSCI via WDI | Liner shipping connectivity | Annual, to 2021 | **In use.** Network position, not a freight rate |
| World Bank WGI via WDI | Rule of law, effectiveness, regulation, corruption | Annual, to 2024 | **In use.** Live codes are `GOV_WGI_*_EST`; the old `RL.EST` family is archived and returns an error body |
| World Bank WDI - prices | Deflator, CPI inflation, exchange rate, real growth | Annual, to 2024 | **In use.** Every trade figure on the site is nominal USD; these separate growth from price |
| Natural Earth / geoBoundaries | Country geometry | Static | Simplified topology for map performance |
| WTO I-TIP / UNCTAD TRAINS | Non-tariff measure inventory | Irregular | **Blocked.** WITS NTM endpoint 403s, the WTO timeseries API needs a subscription key, TRAINS Online has no public JSON. Customs efficiency stands in as a labelled proxy |
| Drewry / Xeneta and similar | Corridor freight rates and lead times | Weekly | **Not licensed.** Corridor-level rates are commercial; only country-level public indices are carried |
| OEC | Complexity indices | Annual | **Off limits.** Terms restrict API/bulk output to internal use, and a public site is dissemination. Methodology reference only |
| UNIDO INDSTAT | Manufacturing output by ISIC, for apparent consumption | Annual, lagged | **Blocked.** Free to a browser since 2022, but `stat.unido.org` returns HTTP 403 to automated requests. Even with the data, output is classified by ISIC activity against trade by HS product, and it covers manufacturing only - so fuels, minerals and agriculture would still have no production figure. Needed before "demand" can mean consumption rather than net import reliance |

## 9. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Comtrade rate limits or API changes | Blocks core data | Bulk download into a local warehouse; never live-proxy |
| HS code revisions (H0–H6) break time series | Wrong trends shown | Build a concordance table; pin one revision per view |
| Mirror-flow discrepancies confuse users | Trust loss | Show both reported values with an explainer |
| Company-level data unavailable or expensive | V2 feature dies | Treat as gated; ship country and product layers first |
| Map performance collapses at high arc counts | Core UX broken | GPU layers, level-of-detail, aggregate below zoom thresholds |
| Opportunity scores read as financial advice | Liability | Explainable scores plus a prominent disclaimer |

## 10. Open questions

1. **"Companies" scope.** The brief asks for "highest selling products of each companies" and "detailed dashboard of each companies." Firm-level trade data is largely proprietary (Panjiva, ImportGenius, Volza). Decide between: (a) country-level only for V1, (b) license a firm-level dataset, or (c) derive a thin company layer from public filings for large listed exporters. **Current working assumption: (a) for V1, (c) as a V2 experiment.**
2. Launch geography — global from day one, or depth-first on one region (India + ASEAN) to prove the opportunity engine?
3. Monetization — free and open, freemium on the opportunity engine and exports, or B2B seats?
4. Does V1's "money flow" include services trade, or goods only?
