---
name: add-data-source
description: Wire a new external dataset into the TradeCenter warehouse — a new Comtrade endpoint, a tariff source, an indicator feed, or a geo dataset. Use when adding, replacing, or re-vintaging any upstream data source. Covers the connector, the five pipeline stages, validation, and the provenance record.
---

# Adding a data source

A new source is not done when data lands on disk. It is done when a dashboard figure derived
from it can be traced back to a URL, a retrieval date, and a validated schema.

## Step 1 — Investigate before coding

Do not write the connector from the documentation. Pull one real sample first.

```bash
# save a raw sample to inspect
python -c "..." > data/raw/_sample_<source>.json
```

Answer these before proceeding, and record the answers in the connector docstring:

- What identifies a country? (ISO3, ISO2, a proprietary numeric code, a name string)
- What identifies a product? (HS revision — which one? SITC? Something custom?)
- Are there aggregate pseudo-countries in the rows? (`World`, `EU-27`, `Areas nes`) — these
  will corrupt every total if not excluded or explicitly handled.
- How are zero and missing distinguished?
- What is the lag, and does the source revise past figures?
- Rate limits, auth requirements, terms of use.

## Step 2 — Connector

Create `data/etl/connectors/<source>.py`:

- One function that fetches and writes to `data/raw/<source>/<vintage>/` — nothing else.
  No cleaning, no reshaping. Raw is immutable.
- Write a sidecar `_meta.json` alongside the data: source name, URL, retrieval timestamp,
  parameters used, license.
- Handle rate limits with backoff. Prefer bulk endpoints over per-row requests.
- Make it resumable — partial failure should not require refetching everything.

## Step 3 — The five stages

Add pipeline steps in `data/etl/pipelines/`:

| Stage | Job |
|---|---|
| `normalize` | Types, column names, one row shape. No semantic changes |
| `conform` | Map to internal identifiers: ISO3 countries, canonical HS codes via `hs_concordance`, drop or flag aggregate pseudo-countries |
| `aggregate` | Produce the materialized `agg_*` tables this source feeds |
| `publish` | Write Parquet to `data/processed/`, partitioned `year/reporter_iso` |

`conform` is where the bugs live. Every unmapped country code and every unmapped product code
must be counted and logged — never silently dropped.

## Step 4 — Validation

Every stage asserts a Pandera schema before writing. Include value ranges, not just types:

- Trade values ≥ 0, and within an order of magnitude of prior vintage for the same key
- Tariff rates within 0–1000% (above that is a units bug)
- Year within expected bounds
- ISO3 codes present in the `countries` table
- Row count in vs. out, with any delta explained in the log

A stage that writes unvalidated output is not finished.

## Step 5 — Register provenance

- Add a row to the source registry so the `meta` block on API responses can cite it.
- Add the source to the table in `docs/PRD.md` §8 if it is new.
- Note known caveats — these surface in the UI's data-provenance panel, so write them for a
  user, not for yourself.

## Step 6 — Verify against reality

Pick three figures you can check against a published source (a World Bank country page, a
national statistics office) and confirm they match within a stated tolerance. Report the
comparison. If they do not match, find out why before shipping — the answer is usually
re-exports, aggregate partners, or a units mismatch.

## Checklist

- [ ] Real sample inspected; identifier scheme documented
- [ ] Connector writes immutable raw + `_meta.json`
- [ ] All five stages implemented
- [ ] Pandera schemas with range checks at every stage
- [ ] Unmapped codes counted and logged, never dropped silently
- [ ] Aggregate pseudo-countries handled explicitly
- [ ] Zero vs. null preserved end to end
- [ ] Source registered for API `meta` provenance
- [ ] Three figures verified against an external published source
- [ ] `docs/PRD.md` §8 updated

## See also

`.claude/rules/data-integrity.md` — the non-negotiables this skill operationalizes.
