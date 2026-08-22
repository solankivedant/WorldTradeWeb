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
"""

from __future__ import annotations

import json
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


def _get(url: str) -> list | dict:
    req = urllib.request.Request(url, headers={"User-Agent": "TradeCenter-ETL/0.1"})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        return json.loads(resp.read())


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
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    started = datetime.now(timezone.utc)

    countries = fetch_countries()
    (RAW_DIR / "countries.json").write_text(json.dumps(countries, indent=1), encoding="utf-8")
    real = sum(1 for c in countries if c["is_country"])
    print(f"countries: {len(countries)} rows ({real} countries, {len(countries) - real} aggregates excluded)")

    indicators = fetch_indicators()
    (RAW_DIR / "indicators.json").write_text(json.dumps(indicators), encoding="utf-8")
    print(f"indicators: {len(indicators)} entities")

    (RAW_DIR / "_meta.json").write_text(
        json.dumps(
            {
                "source": "World Bank Open Data",
                "base_url": API,
                "datasets": ["country reference", "WDI indicators"],
                "indicators": INDICATORS,
                "indicator_years": [INDICATOR_YEAR_FROM, INDICATOR_YEAR_TO],
                "retrieved_at": started.isoformat(),
                "coordinate_note": "lat/lon are capital city coordinates, not polygon centroids",
                "aggregate_note": f"{len(countries) - real} aggregate regions flagged is_country=false",
                "license": "CC-BY-4.0",
            },
            indent=2,
        ),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
