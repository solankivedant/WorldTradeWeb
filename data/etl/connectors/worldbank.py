"""World Bank country reference + context indicators connector.

Source:   https://api.worldbank.org/v2/
Auth:     none required
License:  CC-BY-4.0

Provides the country reference table everything else joins against: ISO3, ISO2, name,
region, income group, and capital coordinates.

TWO THINGS THIS SOURCE GETS RIGHT AND ONE TRAP:

  - Identifiers are ISO3 in the `id` field, matching WITS. No translation needed.
  - `latitude`/`longitude` are CAPITAL CITY coordinates, not centroids. For trade-flow
    arcs this is arguably better than a centroid -- capitals are usually the economic
    anchor -- but it must be documented because it is not what a reader assumes.
  - THE TRAP: the country list includes ~48 aggregate regions ("World", "Euro area",
    "Sub-Saharan Africa", "Low income"). These are NOT countries. Summing them alongside
    real countries double-counts every total. They are identified by
    region.id == "NA" and flagged `is_country: false` here so no downstream stage can
    mistake them.

THE CONTEXT LAYER (see CONTEXT_INDICATORS below):

  Services trade, investment and remittance flows, shipping connectivity, border
  friction, governance and the price level -- everything the goods figures do not
  measure. Twenty-two series, fetched into their OWN raw file so the bytes behind
  already-published GDP and population figures are never disturbed.

  These are not goods trade and must never be summed with it. `basis` on every catalogue
  entry records which kind of fact it is: `customs` (nothing here), `balance-of-payments`
  (services, FDI, remittances), `survey` (LPI, lead times), `composite-index`
  (governance), `unctad-index`, `port-statistics`, `national-accounts`.

WHAT IS NOT HERE AND WHY:

  - NON-TARIFF MEASURES. The inventory of notified NTMs (WTO I-TIP / UNCTAD TRAINS) is
    not publicly reachable: the WITS NTM SDMX endpoint returns 403, the WTO timeseries
    API returns 401 without a subscription key, and TRAINS Online serves a browser
    application with no JSON behind it. All four verified live. The LPI customs-clearance
    sub-index is carried here as the closest PUBLIC proxy for border friction, clearly
    labelled as a perception score -- it counts nobody's certificates or quotas, and it
    must not be presented as an NTM count.
  - CORRIDOR FREIGHT RATES. Commercial data (Drewry, Xeneta and similar). The public
    series here are index-level and country-level: network position, port throughput,
    median lead times.
"""

from __future__ import annotations

import argparse
import json
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

RAW_DIR = Path(__file__).resolve().parents[2] / "raw" / "worldbank"
API = "https://api.worldbank.org/v2"
TIMEOUT = 60

# Context indicators used for normalization (trade as share of GDP, per-capita views).
INDICATORS = {
    "NY.GDP.MKTP.CD": "gdp_usd",
    "SP.POP.TOTL": "population",
}
INDICATOR_YEAR_FROM = 2010
INDICATOR_YEAR_TO = 2023

# ---------------------------------------------------------------------------
# The context layer: everything the goods figures do NOT measure.
#
# Every entry was verified against a live response before being added here (see the
# probe log in the session history) -- not read off the documentation. Three of the
# codes people reach for first do not work:
#
#   - The Worldwide Governance Indicators moved. `RL.EST`, `GE.EST` and friends are in
#     "WDI Database Archives" and return HTTP 200 with an error body. The live codes in
#     the default WDI database are `GOV_WGI_<pillar>_EST`.
#   - Doing Business "time/cost to export" (`IC.EXP.TMBC*`) is gone; the programme was
#     discontinued in 2021 and the series were withdrawn, not frozen.
#   - `&source=3` is rejected outright on the indicator path, so there is no way to
#     reach the archived copies either.
#
# `basis` is the load-bearing field and the reason this is a catalogue rather than a
# dict of codes. A services figure is BALANCE OF PAYMENTS data and a goods figure is
# CUSTOMS data; an LPI score is a survey of freight forwarders' PERCEPTIONS. Those are
# three different kinds of fact, and the UI has to be able to say which it is holding
# without a human remembering. Nothing here may be added to a goods total.
#
# `frontier` records the newest year each series actually publishes, because they do not
# agree: services run to 2024, goods stop at 2023, LPI at 2022, shipping connectivity at
# 2021 and lead times at 2018. A figure shown without its own year invites the reader to
# assume it shares the year of the trade figure beside it.
#
# `cross_country: False` marks a series that is real for one country over time and
# MEANINGLESS between countries. Ranking exchange rates puts the yen above the euro
# because a yen is worth less, and the GDP deflator is indexed to a base year each
# country picks for itself. A rank and a median are facts the UI would be inventing, so
# the catalogue says not to compute them rather than leaving each screen to remember.
# ---------------------------------------------------------------------------
CONTEXT_INDICATORS = [
    # --- 2.6 services and financial flows: the trade this site does not otherwise see ---
    {
        "key": "services_exports", "code": "BX.GSR.NFSV.CD", "family": "services",
        "label": "Services exported", "unit": "usd", "basis": "balance-of-payments",
        "note": "Commercial services sold abroad - transport, travel, IT, business services. "
                "Balance-of-payments data, a different measurement basis from the customs "
                "records behind every goods figure on this site. Never add the two.",
    },
    {
        "key": "services_imports", "code": "BM.GSR.NFSV.CD", "family": "services",
        "label": "Services imported", "unit": "usd", "basis": "balance-of-payments",
        "note": "Commercial services bought from abroad, on the same balance-of-payments "
                "basis as services exports.",
    },
    {
        "key": "fdi_in", "code": "BX.KLT.DINV.CD.WD", "family": "finance",
        "label": "Foreign investment in", "unit": "usd", "basis": "balance-of-payments",
        "note": "Direct investment flowing into the economy, net of disinvestment. A capital "
                "flow, not trade: it can be negative when foreign investors withdraw more "
                "than they put in.",
    },
    {
        "key": "fdi_out", "code": "BM.KLT.DINV.CD.WD", "family": "finance",
        "label": "Foreign investment out", "unit": "usd", "basis": "balance-of-payments",
        "note": "Direct investment this economy's residents made abroad, net of withdrawals.",
    },
    {
        "key": "remittances_in", "code": "BX.TRF.PWKR.CD.DT", "family": "finance",
        "label": "Remittances received", "unit": "usd", "basis": "balance-of-payments",
        "note": "Money sent home by residents working abroad, plus compensation of "
                "employees. For several economies this is larger than any single export "
                "sector and appears nowhere in customs data.",
    },
    {
        "key": "remittances_out", "code": "BM.TRF.PWKR.CD.DT", "family": "finance",
        "label": "Remittances sent", "unit": "usd", "basis": "balance-of-payments",
        "note": "Money sent abroad by foreign workers resident in this economy.",
    },
    # --- 2.7 what it costs and how long it takes to move goods ---
    {
        "key": "shipping_connectivity", "code": "IS.SHP.GCNW.XQ", "family": "connectivity",
        "label": "Shipping connectivity", "unit": "index", "range": [0, 200],
        "higher_is_better": True, "basis": "unctad-index",
        "note": "UNCTAD's Liner Shipping Connectivity Index: how well the country is plugged "
                "into container shipping networks, scaled so the 2004 maximum is 100. An "
                "index of network position, NOT a freight rate - corridor-level rates are "
                "commercial data this project does not license.",
    },
    {
        "key": "container_traffic", "code": "IS.SHP.GOOD.TU", "family": "connectivity",
        "label": "Container port traffic", "unit": "teu", "higher_is_better": True,
        "basis": "port-statistics",
        "note": "Twenty-foot equivalent units moved through the country's ports, including "
                "transshipment - which is why the hubs (Singapore, UAE) sit far above what "
                "their own trade would suggest.",
    },
    {
        "key": "lead_time_export", "code": "LP.EXP.DURS.MD", "family": "connectivity",
        "label": "Lead time to export", "unit": "days", "higher_is_better": False,
        "basis": "survey", "note": "Median days from the port of loading to the destination "
                "port. Survey-based, and the series stops in 2018 - it is a structural "
                "picture, not a current one.",
    },
    {
        "key": "lead_time_import", "code": "LP.IMP.DURS.MD", "family": "connectivity",
        "label": "Lead time to import", "unit": "days", "higher_is_better": False,
        "basis": "survey", "note": "Median days from the origin port to the port of "
                "discharge. Same survey and same 2018 frontier as the export series.",
    },
    # --- 2.5 border friction. NOT an inventory of non-tariff measures: see the module
    #     docstring and docs/future-scope.md 2.5 for why that one is still blocked. ---
    {
        "key": "lpi_customs", "code": "LP.LPI.CUST.XQ", "family": "logistics",
        "label": "Customs efficiency", "unit": "index", "range": [1, 5],
        "higher_is_better": True, "basis": "survey",
        "note": "How efficient border clearance is, scored 1-5 by freight forwarders who "
                "actually cross it. The closest public proxy for non-tariff friction, and a "
                "perception score - it counts nobody's certificates, quotas or standards.",
    },
    {
        "key": "lpi_overall", "code": "LP.LPI.OVRL.XQ", "family": "logistics",
        "label": "Logistics performance", "unit": "index", "range": [1, 5],
        "higher_is_better": True, "basis": "survey",
        "note": "The Logistics Performance Index overall score, 1-5: customs, infrastructure, "
                "shipment pricing, service quality, tracking and timeliness combined.",
    },
    {
        "key": "lpi_infrastructure", "code": "LP.LPI.INFR.XQ", "family": "logistics",
        "label": "Trade infrastructure", "unit": "index", "range": [1, 5],
        "higher_is_better": True, "basis": "survey",
        "note": "Quality of ports, roads, rail and IT for trade, scored 1-5.",
    },
    {
        "key": "lpi_timeliness", "code": "LP.LPI.TIME.XQ", "family": "logistics",
        "label": "Delivery timeliness", "unit": "index", "range": [1, 5],
        "higher_is_better": True, "basis": "survey",
        "note": "How often shipments reach the consignee within the scheduled time, 1-5.",
    },
    # --- 2.8 governance and the price level ---
    {
        "key": "gov_rule_of_law", "code": "GOV_WGI_RL_EST", "family": "governance",
        "label": "Rule of law", "unit": "score", "range": [-2.5, 2.5],
        "higher_is_better": True, "basis": "composite-index",
        "note": "Worldwide Governance Indicators estimate, roughly -2.5 to +2.5: confidence "
                "in contract enforcement, property rights, the police and the courts. A "
                "composite of many underlying sources, each with its own error.",
    },
    {
        "key": "gov_effectiveness", "code": "GOV_WGI_GE_EST", "family": "governance",
        "label": "Government effectiveness", "unit": "score", "range": [-2.5, 2.5],
        "higher_is_better": True, "basis": "composite-index",
        "note": "Perceived quality of public services and policy implementation, -2.5 to +2.5.",
    },
    {
        "key": "gov_regulatory", "code": "GOV_WGI_RQ_EST", "family": "governance",
        "label": "Regulatory quality", "unit": "score", "range": [-2.5, 2.5],
        "higher_is_better": True, "basis": "composite-index",
        "note": "Perceived ability to formulate rules that permit private-sector development, "
                "-2.5 to +2.5.",
    },
    {
        "key": "gov_corruption", "code": "GOV_WGI_CC_EST", "family": "governance",
        "label": "Control of corruption", "unit": "score", "range": [-2.5, 2.5],
        "higher_is_better": True, "basis": "composite-index",
        "note": "Perceived extent to which public power is used for private gain, -2.5 to "
                "+2.5. Higher is cleaner.",
    },
    {
        "key": "gdp_deflator", "code": "NY.GDP.DEFL.ZS", "family": "prices",
        "label": "GDP deflator", "unit": "index", "higher_is_better": None,
        "basis": "national-accounts", "cross_country": False,
        "note": "The economy's own price level, indexed to a base year that DIFFERS BY "
                "COUNTRY. Usable to deflate one country's series over time; not comparable "
                "between countries as a level.",
    },
    {
        "key": "inflation", "code": "FP.CPI.TOTL.ZG", "family": "prices",
        "label": "Consumer inflation", "unit": "percent", "higher_is_better": None,
        "basis": "national-accounts",
        "note": "Annual change in consumer prices. Every trade figure on this site is nominal "
                "USD, so a rising series is part growth and part price.",
    },
    {
        "key": "fx_rate", "code": "PA.NUS.FCRF", "family": "prices",
        "label": "Exchange rate", "unit": "lcu-per-usd", "higher_is_better": None,
        "basis": "national-accounts", "cross_country": False,
        "note": "Local currency units per US dollar, annual average. Trade reported in local "
                "currency passes through this before it becomes a USD figure.",
    },
    {
        "key": "gdp_growth", "code": "NY.GDP.MKTP.KD.ZG", "family": "prices",
        "label": "Real GDP growth", "unit": "percent", "higher_is_better": True,
        "basis": "national-accounts",
        "note": "Annual growth in constant local currency - the real-terms benchmark to read "
                "a nominal trade change against.",
    },
]

CONTEXT_FAMILIES = {
    "services": {
        "label": "Services trade",
        "blurb": "Commercial services bought and sold across borders. Balance-of-payments "
                 "data, not customs records, and invisible in every goods figure here.",
    },
    "finance": {
        "label": "Money that is not trade",
        "blurb": "Investment and remittance flows. These move money across the same borders "
                 "as the goods do, and for some economies they move more of it.",
    },
    "connectivity": {
        "label": "Getting goods there",
        "blurb": "Network position, port throughput and how long a shipment actually takes. "
                 "Public indices only - corridor freight rates are commercial data.",
    },
    "logistics": {
        "label": "Friction at the border",
        "blurb": "Survey scores for customs, infrastructure and reliability. The closest "
                 "public read on the barriers a tariff schedule does not describe.",
    },
    "governance": {
        "label": "Institutions",
        "blurb": "Composite governance estimates. Slow-moving, heavily caveated, and the "
                 "context in which a contract either is or is not enforceable.",
    },
    "prices": {
        "label": "Prices and currency",
        "blurb": "Inflation, the deflator and the exchange rate. Every figure on this site "
                 "is nominal USD, so these are what separate growth from price.",
    },
}

CONTEXT_YEAR_FROM = 2010
CONTEXT_YEAR_TO = 2024


def _get(url: str) -> list | dict:
    req = urllib.request.Request(url, headers={"User-Agent": "TradeCenter-ETL/0.1"})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        return json.loads(resp.read())


def _get_with_retry(url: str, attempts: int = 4) -> list | dict:
    """Exponential backoff. The API is unmetered but not always up."""
    for attempt in range(attempts):
        try:
            return _get(url)
        except Exception as error:  # noqa: BLE001 - retried, then re-raised below
            if attempt == attempts - 1:
                raise
            wait = 2**attempt
            print(f"  retry {attempt + 1}/{attempts - 1} in {wait}s: {type(error).__name__} {error}")
            time.sleep(wait)
    raise RuntimeError("unreachable")


def fetch_countries() -> list[dict]:
    payload = _get(f"{API}/country?format=json&per_page=400")
    rows = payload[1]
    out = []
    for row in rows:
        region_id = (row.get("region") or {}).get("id")
        # region.id == "NA" marks an aggregate, not a country. This one line prevents
        # a whole class of double-counting bugs downstream.
        is_country = region_id not in (None, "", "NA")
        lat, lon = row.get("latitude"), row.get("longitude")
        out.append(
            {
                "iso3": row["id"],
                "iso2": row.get("iso2Code"),
                "name": row.get("name"),
                "region": (row.get("region") or {}).get("value"),
                "region_id": region_id,
                "income_group": (row.get("incomeLevel") or {}).get("value"),
                "capital": row.get("capitalCity") or None,
                # Capital coordinates, not centroids -- see module docstring.
                "lat": float(lat) if lat else None,
                "lon": float(lon) if lon else None,
                "is_country": is_country,
            }
        )
    return out


def fetch_context(only_missing: bool = True) -> dict:
    """Fetch the context layer, keyed by the SOURCE's own indicator codes.

    Deliberately not keyed by our internal names. Raw speaks the source's vocabulary and
    conform translates it; a raw file already wearing our labels cannot be re-read later
    to check what the source actually said.

    Written to its own file rather than folded into `indicators.json`. The World Bank
    revises published series, and every figure already on the site was derived from the
    exact bytes in that file - re-fetching it to pick up new codes would quietly move
    GDP and population underneath them.
    """
    path = RAW_DIR / "context.json"
    if only_missing and path.exists():
        print("context.json already on disk, skipping (pass --refresh-context to refetch)")
        return json.loads(path.read_text(encoding="utf-8"))

    span = f"{CONTEXT_YEAR_FROM}:{CONTEXT_YEAR_TO}"
    series: dict[str, dict[str, dict[str, float]]] = {}
    coverage: dict[str, dict] = {}

    for spec in CONTEXT_INDICATORS:
        code = spec["code"]
        rows_seen = 0
        page, total_pages = 1, 1
        by_iso: dict[str, dict[str, float]] = {}
        while page <= total_pages:
            url = (
                f"{API}/country/all/indicator/{code}"
                f"?format=json&per_page=20000&date={span}&page={page}"
            )
            payload = _get_with_retry(url)
            if not isinstance(payload, list) or len(payload) < 2 or payload[1] is None:
                # HTTP 200 with an error body is how this API reports a withdrawn or
                # renamed indicator. Loud, because a silently empty series would look
                # exactly like a country that does not publish.
                print(f"  !! {code}: no rows -- {str(payload)[:120]}")
                break
            meta, rows = payload[0], payload[1]
            total_pages = meta.get("pages", 1)
            for row in rows:
                iso3 = (row.get("countryiso3code") or "").strip()
                value, year = row.get("value"), row.get("date")
                rows_seen += 1
                # null is "not reported" and stays absent. It must never become a zero:
                # a rule-of-law estimate of 0.0 is a real midpoint score.
                if not iso3 or value is None:
                    continue
                by_iso.setdefault(iso3, {})[year] = value
            page += 1

        years = sorted({y for v in by_iso.values() for y in v})
        series[code] = by_iso
        coverage[code] = {
            "entities": len(by_iso),
            "values": sum(len(v) for v in by_iso.values()),
            "rows_returned": rows_seen,
            # The newest year THIS series publishes. They disagree, and the UI prints
            # each figure's own year for exactly that reason.
            "frontier": int(years[-1]) if years else None,
            "earliest": int(years[0]) if years else None,
        }
        print(
            f"  {code:22} {spec['key']:22} entities={coverage[code]['entities']:3d} "
            f"values={coverage[code]['values']:5d} "
            f"years={coverage[code]['earliest']}..{coverage[code]['frontier']}"
        )
        time.sleep(0.2)  # unmetered, but 22 series is no reason to hammer it

    payload = {
        "catalog": CONTEXT_INDICATORS,
        "families": CONTEXT_FAMILIES,
        "coverage": coverage,
        "series": series,
        "retrieved_at": datetime.now(timezone.utc).isoformat(),
        "years_requested": [CONTEXT_YEAR_FROM, CONTEXT_YEAR_TO],
    }
    path.write_text(json.dumps(payload), encoding="utf-8")
    print(f"context: {len(series)} series -> {path.stat().st_size / 1024:.0f} KB")
    return payload


def fetch_indicators() -> dict:
    out: dict[str, dict] = {}
    span = f"{INDICATOR_YEAR_FROM}:{INDICATOR_YEAR_TO}"
    for code, label in INDICATORS.items():
        page, total_pages = 1, 1
        while page <= total_pages:
            payload = _get(
                f"{API}/country/all/indicator/{code}"
                f"?format=json&per_page=2000&date={span}&page={page}"
            )
            meta, rows = payload[0], (payload[1] or [])
            total_pages = meta.get("pages", 1)
            for row in rows:
                iso3 = (row.get("countryiso3code") or "").strip()
                value, year = row.get("value"), row.get("date")
                if not iso3 or value is None:
                    continue  # null means not reported; we simply omit the key
                out.setdefault(iso3, {}).setdefault(label, {})[year] = value
            page += 1
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--refresh-context",
        action="store_true",
        help="refetch raw/worldbank/context.json even if it is already on disk",
    )
    ap.add_argument(
        "--context-only",
        action="store_true",
        help="fetch only the context layer, leaving country reference and GDP untouched",
    )
    args = ap.parse_args()

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    started = datetime.now(timezone.utc)

    if args.context_only:
        print("fetching context indicators only")
        context = fetch_context(only_missing=not args.refresh_context)
        _write_meta(started, context)
        return

    countries = fetch_countries()
    (RAW_DIR / "countries.json").write_text(json.dumps(countries, indent=1), encoding="utf-8")
    real = sum(1 for c in countries if c["is_country"])
    print(f"countries: {len(countries)} rows ({real} countries, {len(countries) - real} aggregates excluded)")

    indicators = fetch_indicators()
    (RAW_DIR / "indicators.json").write_text(json.dumps(indicators), encoding="utf-8")
    print(f"indicators: {len(indicators)} entities")

    context = fetch_context(only_missing=not args.refresh_context)
    _write_meta(started, context, countries=countries, aggregates=len(countries) - real)


def _write_meta(
    started: datetime,
    context: dict,
    countries: list[dict] | None = None,
    aggregates: int | None = None,
) -> None:
    existing = {}
    meta_path = RAW_DIR / "_meta.json"
    if meta_path.exists():
        existing = json.loads(meta_path.read_text(encoding="utf-8"))

    meta = {
        **existing,
        "source": "World Bank Open Data",
        "base_url": API,
        "datasets": ["country reference", "WDI indicators", "WDI context layer"],
        "indicators": INDICATORS,
        "indicator_years": [INDICATOR_YEAR_FROM, INDICATOR_YEAR_TO],
        "context_indicators": {s["code"]: s["key"] for s in CONTEXT_INDICATORS},
        "context_years": [CONTEXT_YEAR_FROM, CONTEXT_YEAR_TO],
        "context_coverage": context.get("coverage", {}),
        "context_retrieved_at": context.get("retrieved_at"),
        "coordinate_note": "lat/lon are capital city coordinates, not polygon centroids",
        "license": "CC-BY-4.0",
    }
    if countries is not None:
        meta["retrieved_at"] = started.isoformat()
        meta["aggregate_note"] = f"{aggregates} aggregate regions flagged is_country=false"
    meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
