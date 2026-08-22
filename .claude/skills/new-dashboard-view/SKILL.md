---
name: new-dashboard-view
description: Scaffold a new dashboard route in the TradeCenter web app — country, corridor, product, tariff, or a new analytical view. Use when adding any page that displays trade figures. Covers routing, data access, the standard layout, state handling, and the provenance and accessibility requirements every view must satisfy.
---

# Adding a dashboard view

Every dashboard in this app follows one skeleton. Consistency beats per-screen cleverness —
users learn the layout once and then read faster everywhere.

## Step 1 — Route and URL state

Create `apps/web/src/app/<view>/[params]/page.tsx`.

All view state lives in URL search params via `nuqs` — year, filters, selected sector,
comparison target. The rule: **if a user could want to send this screen to someone, its state
is in the URL.** Never hold a filter in component state alone.

```
/country/[iso]?year=2024&flow=export
/corridor/[a]/[b]?year=2024&level=hs4
/product/[hs]?year=2024&metric=value
```

## Step 2 — Data access

Add the fetcher to `apps/web/src/lib/api/`. Never fetch inside a component.

- Server Component fetches for initial load; TanStack Query for client-side filter changes.
- The response must carry a `meta` block (`source`, `vintage`, `caveats`). Do not strip it.
- If the query is not served by an existing `agg_*` table, stop and decide whether to add one.
  Default-screen data should be a lookup, not a live aggregation.

## Step 3 — Layout

```
KPI row  (3–4 headline numbers with YoY deltas)
  ↓
Two-column detail  (composition left, ranked list right)
  ↓
Full-width time series  (10-year context)
  ↓
Cross-links  (the one obvious next question)
```

Each level of drill-down answers a question and offers exactly one obvious next one. If a view
has no cross-links, it is a dead end and needs rethinking.

## Step 4 — Charts

Load the `dataviz` skill before writing chart code — palette formula, form heuristic, and the
accessibility validator live there.

Then, for this project specifically:

- Chart components take `data` as a prop and never fetch.
- Sector colors come from the global mapping, not a per-chart palette. Cap at 8 categories
  plus "Other."
- Tabular figures for every number.
- Every chart has a table toggle showing the underlying rows.
- Sequential ramp for volume; diverging ramp with a neutral zero for balance; never red/green.

## Step 5 — States

| State | Requirement |
|---|---|
| Loading | Skeleton matching the final layout. Never a spinner over blank space |
| No data | Distinct treatment from zero. Say *why* it is missing if known |
| Partial data | Render what exists, flag what is missing inline |
| Error | Actionable message and a retry, not a stack trace |
| Empty filter result | Name the too-narrow filter and offer to widen it |

## Step 6 — Provenance and access

- Data-provenance panel reachable from the view: source, vintage, retrieval date, caveats.
- Mirror-flow discrepancies shown, not smoothed over.
- Keyboard-navigable: every drill-down reachable without the map or a mouse.
- Responsive down to 375px — check the KPI row and the widest table.

## Checklist

- [ ] Route created; all view state in URL params via nuqs
- [ ] Fetcher in `lib/api/`, `meta` block preserved
- [ ] Served by an `agg_*` table, or a deliberate decision not to
- [ ] Standard layout skeleton followed
- [ ] `dataviz` skill loaded before chart work
- [ ] Global sector colors used
- [ ] Table toggle on every chart
- [ ] All six states handled
- [ ] Provenance panel wired
- [ ] Keyboard path exists; 375px verified
- [ ] Cross-links to the next obvious question

## See also

`docs/DESIGN.md` §3 for layout wireframes, `.claude/rules/code-style.md` for conventions.
