# Tech Stack — TradeCenter

**Status:** Proposed v0.1
**Last updated:** 2026-08-22

Every choice below is a default, not a commitment. Where a decision is genuinely close, the alternative and the tiebreaker are recorded. Reversing one later should mean writing an ADR in [docs/adr/](adr/), not a rewrite.

---

## 1. The shape of the system

```
                 ┌──────────────────────────────────────┐
                 │  Browser — Next.js app               │
                 │  MapLibre + deck.gl · Recharts/visx  │
                 └───────────────┬──────────────────────┘
                                 │ HTTP (JSON, PMTiles, Parquet)
                 ┌───────────────┴──────────────────────┐
                 │  Next.js Route Handlers (BFF)        │
                 │  auth · caching · response shaping   │
                 └───────────────┬──────────────────────┘
                                 │
                 ┌───────────────┴──────────────────────┐
                 │  FastAPI analytics service (Python)  │
                 │  opportunity engine · aggregations   │
                 └───────────────┬──────────────────────┘
                                 │
        ┌────────────────────────┼────────────────────────┐
        │                        │                        │
  ┌─────┴──────┐         ┌───────┴────────┐       ┌───────┴───────┐
  │ PostgreSQL │         │ DuckDB/Parquet │       │ Redis cache   │
  │ app state  │         │ trade cube     │       │ hot responses │
  └────────────┘         └────────────────┘       └───────────────┘
                                 ▲
                 ┌───────────────┴──────────────────────┐
                 │  ETL — Python (Polars) + Prefect     │
                 │  Comtrade · WITS · WTO · WDI · geo   │
                 └──────────────────────────────────────┘
```

The load-bearing idea: **trade data is large, static, and read-only.** It is written once per refresh cycle by ETL and read constantly by users. So the analytics path is a columnar cube, not a row-store — and almost everything users see can be precomputed.

---

## 2. Frontend

| Concern | Choice | Why |
|---|---|---|
| Framework | **Next.js 15 (App Router)** + React 19 | Server components keep heavy aggregation off the client; file routing maps cleanly to `/country/[iso]`, `/corridor/[a]/[b]`, `/product/[hs]`; one deploy target |
| Language | **TypeScript**, strict | Trade records have many near-identical numeric fields; types are the guardrail |
| Map renderer | **MapLibre GL JS** | Open source, no token/vendor lock, vector tiles, mature |
| Map data layers | **deck.gl** (`ArcLayer`, `GeoJsonLayer`, `ScatterplotLayer`) | GPU-rendered arcs are the only way 10k+ flows stay at 45+ fps; overlays cleanly on MapLibre |
| Tiles | **PMTiles** (single-file, range requests) | Country polygons served from static storage — no tile server to run or pay for |
| Charts | **Recharts** for standard charts, **visx** where custom | Recharts covers 80% fast; visx handles the treemap, sankey, and tariff heatmap |
| Styling | **Tailwind CSS v4** | Dense dashboards need utility-speed iteration |
| Components | **shadcn/ui** (Radix under the hood) | Own the source, accessible primitives, no theme fight |
| Server state | **TanStack Query** | Caching, dedupe, background refetch — trade data is cache-friendly |
| Client state | **Zustand** + **nuqs** | Zustand for UI state; nuqs binds map filters to URL params, which is what makes views permalinkable |
| Tables | **TanStack Table** | Headless — sorting and virtualization over long HS-code tables |

**Alternative considered:** Mapbox GL JS (better out-of-box styling, but per-load pricing at scale and a proprietary license) and Observable Plot (elegant, but weaker interactivity for click-through dashboards).

---

## 3. Backend

| Concern | Choice | Why |
|---|---|---|
| BFF layer | **Next.js Route Handlers** | Auth, session, response shaping, caching headers — no separate Node service |
| Analytics service | **Python + FastAPI** | The opportunity engine, concordance mapping, and aggregation are data work; Python has the ecosystem and async FastAPI keeps it fast |
| Validation | **Zod** (TS) / **Pydantic v2** (Py) | Schema at both boundaries; generate TS types from the OpenAPI spec so they cannot drift |
| Auth | **Auth.js** + Postgres adapter | V1 is mostly public; auth gates saved views and watchlists |

**Why two backends and not one.** Next.js alone would work for V1's CRUD. It would not carry the opportunity engine, HS concordance, or bulk aggregation — that is Polars/DuckDB territory. Keeping the analytics service separate lets it scale, restart, and be reasoned about independently. If in three months the Python service is only doing trivial pass-through, collapse it into Next.js and write the ADR.

---

## 4. Data layer

| Concern | Choice | Why |
|---|---|---|
| App database | **PostgreSQL 16** (Neon or Supabase) | Users, saved views, watchlists, annotations. Boring and correct |
| ORM | **Drizzle** (TS) / **SQLAlchemy 2** (Py) | Drizzle for the app schema; SQLAlchemy only where the analytics service needs relational access |
| Analytics store | **DuckDB over Parquet** | The trade cube is tens of millions of rows, read-only, and column-oriented queries dominate. DuckDB does this on one machine at a fraction of a warehouse's cost |
| File layout | Parquet partitioned by `year / reporter_iso` | Partition pruning makes the common query touch a few files |
| Cache | **Redis** (Upstash) | Precomputed dashboard payloads, opportunity results, tariff lookups |
| Geo data | Natural Earth 1:50m, simplified with **mapshaper**, served as PMTiles | Small enough to load fast, accurate enough to look right |

**Why DuckDB over BigQuery/ClickHouse/Postgres.** BigQuery is priced per-scan and this is a read-heavy public app — bad fit. ClickHouse is excellent but is another service to operate. Postgres would work but is 10–50x slower on wide analytical scans. DuckDB embeds in the analytics service and reads Parquet directly from object storage. Revisit if the cube passes ~200M rows or concurrent query load outgrows one node.

---

## 5. ETL pipeline

| Concern | Choice | Why |
|---|---|---|
| Transform engine | **Polars** | 5–20x faster than pandas on these joins; lazy execution handles files larger than RAM |
| Orchestration | **Prefect** (start with plain scripts + cron) | Do not add an orchestrator before there are dependencies worth orchestrating |
| Validation | **Pandera** | Trade data has real dirt — nulls, code changes, revised figures. Assert schema and ranges at every stage or it silently corrupts dashboards |
| Storage | **Cloudflare R2** (S3-compatible) | No egress fees; Parquet + PMTiles served straight from it |
| Ingestion mode | Bulk download, never live API proxy | Comtrade rate limits make live proxying fragile and slow |

**Stages:** `raw → normalize → conform → aggregate → publish`. Raw files are kept immutable so any published figure can be re-derived. The `conform` stage is where HS revision concordance and ISO code harmonization happen — the single most bug-prone step in this project.

---

## 6. Infrastructure

| Concern | Choice | Why |
|---|---|---|
| Web hosting | **Vercel** | Next.js-native edge caching, preview deploys |
| API hosting | **Fly.io** or Railway (Docker) | Analytics service needs persistent memory for DuckDB; serverless cold starts hurt here |
| Object storage | **Cloudflare R2** | Parquet, PMTiles, exports |
| Postgres | **Neon** | Branching databases pair well with preview deploys |
| Redis | **Upstash** | Serverless-friendly, pay per request |
| CI/CD | **GitHub Actions** | Lint, typecheck, test, ETL validation on schedule |
| Monitoring | **Sentry** + **PostHog** | Errors and product analytics; PostHog answers whether people actually drill down |

---

## 7. Tooling

| Concern | Choice |
|---|---|
| Monorepo | **pnpm workspaces** + **Turborepo** |
| Lint / format (TS) | **Biome** — one fast tool replacing ESLint + Prettier |
| Lint / format (Py) | **Ruff** + **uv** for dependency management |
| Testing (TS) | **Vitest** (unit) + **Playwright** (e2e) |
| Testing (Py) | **pytest** |
| Git hooks | **Lefthook** |

---

## 8. Version pins

| Runtime | Version |
|---|---|
| Node | 22 LTS |
| pnpm | 9 |
| Python | 3.12 |
| PostgreSQL | 16 |

---

## 9. What is deliberately not here

- **Kubernetes** — two services do not need an orchestrator.
- **GraphQL** — the query shapes are known and stable; REST + typed clients is less machinery.
- **A message queue** — ETL is scheduled batch, not event-driven. Add one when there is a real async need.
- **Microservices beyond these two** — splitting further before the domain boundaries are proven is a way to create distributed bugs.
- **An ML model in the opportunity engine** — V1 rules must be explainable. ML enters only when there is labeled outcome data to train on and an explainability story.
