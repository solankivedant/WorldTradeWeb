"""raw -> normalize -> conform -> aggregate -> publish

Turns the raw WITS + World Bank drops into the published datasets the web app reads.

THE THREE THINGS THIS STAGE EXISTS TO GET RIGHT:

  1. UNITS. WITS delivers trade values in thousands of USD. They become USD here,
     exactly once, and never again anywhere in the stack.

  2. AGGREGATE PSEUDO-COUNTRIES. WITS partner lists include entries that are not
     countries. Summing them with real partners double-counts. They are dropped at
     conform, and the count of what was dropped is logged -- silent dropping is how
     you lose 8% of world trade and never notice.

  3. ZERO vs NOT-REPORTED. A raw file marked `_no_data` produces an absent key, not a
     zero. Downstream, absent renders as a hatch on the map; zero renders as the zero
     color. They must never converge.

Run:  python -m data.etl.pipelines.build --vintage 2026-08-22
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "raw"
OUT = ROOT / "processed"

THOUSANDS_TO_USD = 1_000.0

# Superseded ISO 3166-1 codes WITS still emits. Mapping these back is not cosmetic:
# without it, Romania, Serbia, Sudan, DR Congo, Montenegro and Timor-Leste vanish from
# every bilateral total. The first build dropped 1,119 rows this way and only the
# drop-logging surfaced it.
LEGACY_ISO3 = {
    "ROM": "ROU",
    "SER": "SRB",
    "SUD": "SDN",
    "ZAR": "COD",
    "MNT": "MNE",
    "TMP": "TLS",
}

# Aggregates and unallocated residuals, not countries. Summing these alongside real
# partners double-counts. `wld` is the world total and is used only for country totals.
NON_COUNTRY_PARTNERS = {
    # World Bank region aggregates
    "WLD", "ECS", "NAC", "LCN", "EAS", "SSF", "MEA", "SAS", "EUN",
    # unallocated / residual categories
    "UNS", "OAS", "SPE", "FRE", "ZZZ", "ALL", "OTH",
    # "Bunkers" -- fuel loaded onto ships and aircraft, allocated to no destination
    "BUN",
    # uninhabited / Antarctic territories with no economy
    "ATA", "ATF", "BVT", "SGS", "HMD", "UMI",
}

# THE PRODUCT ALLOWLIST -- and why it is an allowlist rather than a rename map.
#
# A `product/all` request returns 29 codes drawn from THREE OVERLAPPING classification
# schemes at once, with no field distinguishing them:
#
#   1. HS section groups  ("01-05_Animal", "27-27_Fuels")  -- mutually exclusive
#   2. UNCTAD stage-of-processing ("UNCTAD-SoP1".."SoP4")  -- a parallel scheme
#   3. ad-hoc aggregates  ("manuf", "Food", "Textiles")    -- overlap both of the above
#
# Summing all 29 overcounts India's 2022 exports by 3.4x ($1,542B against a reported
# $453B). The 16 HS section groups below are the only mutually exclusive set: they sum
# to $452.7B, matching the reported total to the decimal.
#
# So this dict is a whitelist, not a lookup with a fallback. A code absent from it is
# dropped and counted -- a fallback to the raw name is exactly what let the overlapping
# schemes through in the first place.
SECTOR_LABELS = {
    "01-05_Animal": "Animal products",
    "06-15_Vegetable": "Vegetable products",
    "16-24_FoodProd": "Food products",
    "25-26_Minerals": "Minerals",
    "27-27_Fuels": "Fuels",
    "28-38_Chemicals": "Chemicals",
    "39-40_PlastiRub": "Plastics & rubber",
    "41-43_HidesSkin": "Hides & skins",
    "44-49_Wood": "Wood products",
    "50-63_TextCloth": "Textiles & clothing",
    "64-67_Footwear": "Footwear",
    "68-71_StoneGlas": "Stone & glass",
    "72-83_Metals": "Metals",
    "84-85_MachElec": "Machinery & electronics",
    "86-89_Transport": "Transport",
    "90-99_Miscellan": "Miscellaneous",
}

# Position of each sector in the published `codes` array. Fixed by SECTOR_LABELS' own
# insertion order, so the index is stable as long as that dict is only appended to -
# reordering it would silently relabel every corridor-sector figure already published.
SECTOR_INDEX = {code: i for i, code in enumerate(SECTOR_LABELS)}


# ---------------------------------------------------------------- normalize

def parse_sdmx(payload: dict) -> list[dict]:
    """Flatten one SDMX-JSON response into plain rows.

    SDMX encodes each series key as colon-joined *positional indexes* into the
    dimension value lists ("0:0:17:0:0"), and observations as indexes into the
    observation dimension. Nothing is self-describing; you must carry the structure
    alongside. This function is the only place in the codebase that knows that.
    """
    if not payload or payload.get("_no_data"):
        return []
    datasets = payload.get("dataSets") or []
    structure = payload.get("structure") or {}
    if not datasets:
        return []

    series_dims = structure.get("dimensions", {}).get("series", [])
    obs_dims = structure.get("dimensions", {}).get("observation", [])
    if not series_dims:
        return []

    dim_ids = [d["id"] for d in series_dims]
    dim_values = [[v["id"] for v in d.get("values", [])] for d in series_dims]
    dim_names = [{v["id"]: v.get("name", v["id"]) for v in d.get("values", [])} for d in series_dims]
    time_values = [v["id"] for v in obs_dims[0].get("values", [])] if obs_dims else ["0"]

    rows: list[dict] = []
    for key, series in (datasets[0].get("series") or {}).items():
        idx = [int(i) for i in key.split(":")]
        record = {}
        for pos, dim_id in enumerate(dim_ids):
            code = dim_values[pos][idx[pos]]
            record[dim_id] = code
            record[f"{dim_id}_NAME"] = dim_names[pos].get(code, code)
        for obs_idx, obs in (series.get("observations") or {}).items():
            value = obs[0] if obs else None
            if value is None:
                continue  # not reported -- omit the key entirely, never write 0
            rows.append({**record, "YEAR": time_values[int(obs_idx)], "VALUE": value})
    return rows


def read_raw(path: Path) -> dict | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        print(f"  ! unreadable: {path}", file=sys.stderr)
        return None


# ---------------------------------------------------------------- conform + aggregate

def build(vintage: str) -> dict:
    wits_dir = RAW / "wits" / vintage
    if not wits_dir.exists():
        raise SystemExit(f"no raw WITS drop at {wits_dir}")

    countries_raw = json.loads((RAW / "worldbank" / "countries.json").read_text(encoding="utf-8"))
    indicators = json.loads((RAW / "worldbank" / "indicators.json").read_text(encoding="utf-8"))

    countries = {
        c["iso3"]: {
            "iso3": c["iso3"],
            "iso2": c["iso2"],
            "name": c["name"],
            "region": c["region"],
            "incomeGroup": c["income_group"],
            "capital": c["capital"],
            "lat": c["lat"],
            "lon": c["lon"],
        }
        for c in countries_raw
        if c["is_country"]
    }
    valid_iso = set(countries)

    totals: dict[str, dict[str, dict[str, float]]] = defaultdict(dict)
    bilateral: list[dict] = []
    products: dict[str, dict[str, list]] = {}
    tariffs: dict[str, dict[str, float]] = {}
    # reporter -> flow -> partner -> {sector index: USD}. Indexes rather than codes
    # because the sector string would otherwise be repeated a few hundred thousand times
    # in the published file, which roughly triples it for no information.
    bilateral_sectors: dict[str, dict[str, dict[str, list]]] = {}

    stats = {
        "reporters_seen": 0,
        "reporters_with_data": 0,
        "partners_dropped_aggregate": 0,
        "partners_dropped_territory": 0,
        "bilateral_rows": 0,
        "bilateral_sector_rows": 0,
        "no_data_files": 0,
        "products_dropped_other_scheme": 0,
    }
    dropped_codes: dict[str, int] = defaultdict(int)

    for reporter_dir in sorted(wits_dir.iterdir()):
        if not reporter_dir.is_dir():
            continue
        reporter = LEGACY_ISO3.get(reporter_dir.name.upper(), reporter_dir.name)
        stats["reporters_seen"] += 1
        if reporter not in valid_iso:
            continue
        had_data = False

        # --- country totals time series ---
        for flow, fname in (("x", "totals_export.json"), ("m", "totals_import.json")):
            payload = read_raw(reporter_dir / fname)
            if payload is None:
                continue
            if payload.get("_no_data"):
                stats["no_data_files"] += 1
                continue
            for row in parse_sdmx(payload):
                year = row["YEAR"]
                totals[reporter].setdefault(year, {})[flow] = row["VALUE"] * THOUSANDS_TO_USD
                had_data = True

        # --- bilateral, latest year ---
        for flow, fname in (("x", "bilateral_export.json"), ("m", "bilateral_import.json")):
            payload = read_raw(reporter_dir / fname)
            if payload is None or payload.get("_no_data"):
                if payload is not None:
                    stats["no_data_files"] += 1
                continue
            for row in parse_sdmx(payload):
                partner = row.get("PARTNER", "").upper()
                partner = LEGACY_ISO3.get(partner, partner)
                if partner in NON_COUNTRY_PARTNERS:
                    stats["partners_dropped_aggregate"] += 1
                    dropped_codes[partner] += 1
                    continue
                if partner not in valid_iso:
                    # Small dependent territories the World Bank country reference does
                    # not carry (Tokelau, Niue, Pitcairn...). Genuinely tiny, and absent
                    # from our geometry and country list, so excluding them is a
                    # deliberate scope decision -- counted separately from aggregates so
                    # a real country appearing here is visible rather than buried.
                    stats["partners_dropped_territory"] += 1
                    dropped_codes[partner] += 1
                    continue
                bilateral.append(
                    {
                        "r": reporter,
                        "p": partner,
                        "f": flow,
                        "v": row["VALUE"] * THOUSANDS_TO_USD,
                        "y": int(row["YEAR"]),
                    }
                )
                had_data = True

        # --- bilateral BY SECTOR, latest year ---
        #
        # Same partner allowlist as the bilateral totals above, and the same PRODUCTCODE
        # allowlist as the product composition below. Both filters are load-bearing here
        # for the same reasons they are there: `partner/all` carries ~30 aggregate
        # pseudo-countries, and `product/all` mixes three overlapping classification
        # schemes, so an unfiltered sum over this response overstates a corridor several
        # times over.
        #
        # These rows are NOT reconciled against the corridor totals from
        # `bilateral_export.json`. WITS computes the two aggregations separately and they
        # disagree for some reporters, exactly as the country-level and sector-level
        # totals already do (DOM, GUY). Publishing both and letting the UI show the gap is
        # the standing rule; silently scaling one to match the other would invent data.
        sector_entry: dict[str, dict[str, list]] = {}
        for flow, fname in (
            ("x", "bilateral_sector_export.json"),
            ("m", "bilateral_sector_import.json"),
        ):
            payload = read_raw(reporter_dir / fname)
            if payload is None or payload.get("_no_data"):
                if payload is not None:
                    stats["no_data_files"] += 1
                continue
            by_partner: dict[str, dict[int, float]] = defaultdict(dict)
            for row in parse_sdmx(payload):
                code = row.get("PRODUCTCODE", "")
                if code not in SECTOR_INDEX:
                    stats["products_dropped_other_scheme"] += 1
                    continue
                partner = row.get("PARTNER", "").upper()
                partner = LEGACY_ISO3.get(partner, partner)
                if partner in NON_COUNTRY_PARTNERS:
                    stats["partners_dropped_aggregate"] += 1
                    dropped_codes[partner] += 1
                    continue
                if partner not in valid_iso:
                    stats["partners_dropped_territory"] += 1
                    dropped_codes[partner] += 1
                    continue
                value = row["VALUE"] * THOUSANDS_TO_USD
                if value <= 0:
                    # A reported zero carries no corridor-sector information and would
                    # cost as much to publish as a real figure. Absent stays absent.
                    continue
                by_partner[partner][SECTOR_INDEX[code]] = value
            if by_partner:
                packed = {
                    partner: sorted(
                        ([idx, round(v, 1)] for idx, v in slices.items()),
                        key=lambda pair: -pair[1],
                    )
                    for partner, slices in by_partner.items()
                }
                sector_entry[flow] = packed
                stats["bilateral_sector_rows"] += sum(len(v) for v in packed.values())
                had_data = True
        if sector_entry:
            bilateral_sectors[reporter] = sector_entry

        # --- product composition, latest year ---
        prod_entry: dict[str, list] = {}
        for flow, fname in (("x", "products_export.json"), ("m", "products_import.json")):
            payload = read_raw(reporter_dir / fname)
            if payload is None or payload.get("_no_data"):
                continue
            items = []
            for row in parse_sdmx(payload):
                code = row.get("PRODUCTCODE", "")
                if code not in SECTOR_LABELS:
                    # Not an HS section group -- a parallel or overlapping scheme.
                    # Dropped deliberately; see the SECTOR_LABELS comment.
                    stats["products_dropped_other_scheme"] += 1
                    continue
                items.append(
                    {
                        "code": code,
                        "name": SECTOR_LABELS[code],
                        "value": row["VALUE"] * THOUSANDS_TO_USD,
                    }
                )
            if items:
                items.sort(key=lambda r: -r["value"])
                prod_entry[flow] = items
                had_data = True
        if prod_entry:
            products[reporter] = prod_entry

        # --- tariffs applied by this reporter, by partner ---
        payload = read_raw(reporter_dir / "tariffs.json")
        if payload is not None and not payload.get("_no_data"):
            rates = {}
            for row in parse_sdmx(payload):
                partner = LEGACY_ISO3.get(
                    row.get("PARTNER", "").upper(), row.get("PARTNER", "").upper()
                )
                if partner in NON_COUNTRY_PARTNERS or partner not in valid_iso:
                    continue
                rate = row["VALUE"]
                # Range check: an applied simple-average tariff above 1000% is a units
                # bug upstream, not a real rate. Fail loudly rather than publish it.
                if rate < 0 or rate > 1000:
                    print(f"  ! implausible tariff {reporter}->{partner}: {rate}", file=sys.stderr)
                    continue
                rates[partner] = rate
            if rates:
                tariffs[reporter] = rates

        if had_data:
            stats["reporters_with_data"] += 1

    stats["bilateral_rows"] = len(bilateral)
    stats["dropped_partner_codes"] = dict(sorted(dropped_codes.items(), key=lambda kv: -kv[1])[:15])

    # --- mirror aggregates for countries that report nothing -----------------
    #
    # 61 economies file no export report with WITS, and Comtrade has nothing for them
    # either (verified live for RUS and BGD, 2023: HTTP 200, zero rows). Russia alone is
    # $424B of exports. Left as-is their country pages read "does not report" while the
    # map, which reconstructs corridors from partners, shows them trading hundreds of
    # billions - the product contradicting itself.
    #
    # The fix is MIRROR DATA: every export from one country is an import to another, so a
    # silent country's trade can be rebuilt from what its partners say about it. This is
    # the same method the OEC uses for the same problem, and it is derivation, not
    # measurement - so it is published to its OWN file, tagged, counted, and never merged
    # into `totals` or `products` where a reader could mistake it for a reported figure.
    #
    # `partners` travels with every figure because it is the only honest measure of how
    # much weight it carries: a total assembled from 120 partners is a good estimate, one
    # assembled from 3 is barely a hint, and the number is the difference between them.
    mirror: dict[str, dict] = {}
    reporting = {row["r"] for row in bilateral}
    silent = sorted(iso for iso in countries if iso not in reporting)

    # Corridor totals, seen from the other side.
    mirror_x: dict[str, float] = defaultdict(float)
    mirror_m: dict[str, float] = defaultdict(float)
    mirror_xp: dict[str, set] = defaultdict(set)
    mirror_mp: dict[str, set] = defaultdict(set)
    for row in bilateral:
        partner = row["p"]
        if partner in reporting:
            continue
        if row["f"] == "m":
            # The reporter says it BOUGHT from `partner`, so `partner` sold.
            mirror_x[partner] += row["v"]
            mirror_xp[partner].add(row["r"])
        else:
            mirror_m[partner] += row["v"]
            mirror_mp[partner].add(row["r"])

    # Sector mix, same inversion over the corridor-sector cube.
    mirror_sectors: dict[str, dict[str, dict[int, float]]] = defaultdict(
        lambda: {"x": defaultdict(float), "m": defaultdict(float)}
    )
    for reporter, flows in bilateral_sectors.items():
        for flow, partners in flows.items():
            # reporter's imports (`m`) from a silent partner are that partner's exports.
            side = "x" if flow == "m" else "m"
            for partner, slices in partners.items():
                if partner in reporting:
                    continue
                for index, value in slices:
                    mirror_sectors[partner][side][index] += value

    for iso in silent:
        exports = mirror_x.get(iso, 0.0)
        imports = mirror_m.get(iso, 0.0)
        if exports <= 0 and imports <= 0:
            # Nobody reports trading with them either. Genuinely absent, and mostly
            # territories counted inside a parent customs union (Monaco inside France,
            # Puerto Rico inside the USA). Publishing a zero here would invent a fact.
            continue
        slices = mirror_sectors.get(iso, {"x": {}, "m": {}})
        mirror[iso] = {
            "exports": round(exports, 1) if exports > 0 else None,
            "imports": round(imports, 1) if imports > 0 else None,
            "exportPartners": len(mirror_xp.get(iso, ())),
            "importPartners": len(mirror_mp.get(iso, ())),
            "sectors": {
                flow: sorted(
                    ([index, round(value, 1)] for index, value in slices[flow].items()),
                    key=lambda pair: -pair[1],
                )
                for flow in ("x", "m")
            },
        }

    stats["mirror_countries"] = len(mirror)
    stats["silent_reporters"] = len(silent)

    # --- context indicators, conformed to the country set ---
    context = {
        iso: {
            "gdp": indicators.get(iso, {}).get("gdp_usd", {}),
            "population": indicators.get(iso, {}).get("population", {}),
        }
        for iso in countries
        if iso in indicators
    }

    return {
        "countries": countries,
        "totals": totals,
        "bilateral": bilateral,
        "bilateral_sectors": bilateral_sectors,
        "mirror": mirror,
        "products": products,
        "tariffs": tariffs,
        "context": context,
        "stats": stats,
        "reconcile_failures": [],
    }


# ---------------------------------------------------------------- validate

def validate(data: dict) -> list[str]:
    """Assert the published shape before writing. Range checks matter as much as types."""
    problems: list[str] = []

    if len(data["countries"]) < 150:
        problems.append(f"only {len(data['countries'])} countries -- reference table looks truncated")

    if data["stats"]["bilateral_rows"] < 10_000:
        problems.append(f"only {data['stats']['bilateral_rows']} bilateral rows -- fetch likely incomplete")

    # A mirror figure assembled from one or two partners is not an estimate, it is a
    # rumour. Anything that thin should not be published as a country total.
    thin = [
        iso
        for iso, row in data["mirror"].items()
        if row["exports"] is not None and row["exportPartners"] < 3
    ]
    if len(thin) > len(data["mirror"]) * 0.35:
        problems.append(
            f"{len(thin)}/{len(data['mirror'])} mirror totals rest on fewer than 3 "
            "reporting partners -- the inversion is probably picking up the wrong side"
        )

    # Russia is the largest silent economy and the reason this exists. If its mirror
    # export total is not in the right order of magnitude, the inversion is inverted.
    rus = data["mirror"].get("RUS", {}).get("exports")
    if rus is not None and not (2e11 <= rus <= 8e11):
        problems.append(f"mirror RUS exports ${rus:,.0f} outside the plausible $200-800B band")

    if data["stats"]["bilateral_sector_rows"] < 100_000:
        problems.append(
            f"only {data['stats']['bilateral_sector_rows']} corridor-sector rows -- "
            "the bilateral_sector_* fetch is likely incomplete"
        )

    # A corridor's sector slices should land near its reported total. WITS aggregates the
    # two separately so they will not match exactly; an order-of-magnitude gap means the
    # product allowlist let an overlapping scheme through, which is the failure that
    # overstated India 3.4x the first time.
    totals_by_corridor = {
        (row["r"], row["p"], row["f"]): row["v"] for row in data["bilateral"]
    }
    checked = overshoot = 0
    for reporter, flows in data["bilateral_sectors"].items():
        for flow, partners in flows.items():
            for partner, slices in partners.items():
                total = totals_by_corridor.get((reporter, partner, flow))
                if not total or total <= 0:
                    continue
                checked += 1
                if sum(v for _, v in slices) > total * 1.5:
                    overshoot += 1
    if checked and overshoot / checked > 0.02:
        problems.append(
            f"{overshoot}/{checked} corridors have sector slices summing >150% of their "
            "reported total -- the PRODUCTCODE allowlist is probably letting a parallel "
            "classification scheme through"
        )

    for iso, years in data["totals"].items():
        for year, flows in years.items():
            for flow, value in flows.items():
                if value < 0:
                    problems.append(f"negative trade value {iso} {year} {flow}={value}")
                if value > 1e13:  # $10T -- larger than any single country's trade
                    problems.append(f"implausible trade value {iso} {year} {flow}={value:,.0f}")

    for row in data["bilateral"]:
        if row["v"] < 0:
            problems.append(f"negative bilateral {row['r']}->{row['p']} {row['v']}")
            break

    for iso, rates in data["tariffs"].items():
        for partner, rate in rates.items():
            if not (0 <= rate <= 1000):
                problems.append(f"tariff out of range {iso}->{partner} {rate}")
                break

    # Sector sums must reconcile with the reported country total. This is the check
    # that would have caught the overlapping-scheme bug on the first build.
    #
    # A handful of countries fail it for a reason that is NOT our bug: WITS's own
    # product-level and total-level aggregations disagree for them (Dominican Republic
    # by 11%, Guyana by 3%). We publish those figures anyway, flagged, rather than
    # silently picking one -- the same principle as mirror-flow discrepancies. A
    # WIDESPREAD failure, though, means we broke something, so the check still blocks
    # above a threshold.
    reconcile_failures = []
    for iso, flows in data["products"].items():
        for flow, key in (("x", "x"), ("m", "m")):
            rows = flows.get(flow)
            if not rows:
                continue
            years = data["totals"].get(iso, {})
            if not years:
                continue
            latest = max(years)
            reported = years[latest].get(key)
            if not reported:
                continue
            summed = sum(r["value"] for r in rows)
            drift = abs(summed - reported) / reported
            if drift > 0.02:  # 2% tolerance for rounding and suppressed lines
                reconcile_failures.append(f"{iso} {flow}: sectors sum to {summed:,.0f} vs reported {reported:,.0f} ({drift:.0%} off)")
    checked = sum(1 for flows in data["products"].values() for f in ("x", "m") if flows.get(f))
    if checked and len(reconcile_failures) / checked > 0.05:
        problems.append(
            f"{len(reconcile_failures)}/{checked} sector-sum reconciliations failed "
            f"-- too many to be a source quirk, e.g. {reconcile_failures[0]}"
        )
    data["reconcile_failures"] = reconcile_failures

    # Sanity anchor: a handful of figures we can check against published reality.
    # If these drift far, something upstream changed and the whole publish is suspect.
    anchors = {"USA": (1.4e12, 2.5e12), "CHN": (2.5e12, 4.0e12), "IND": (2.5e11, 6.0e11)}
    for iso, (lo, hi) in anchors.items():
        years = data["totals"].get(iso, {})
        if not years:
            problems.append(f"anchor country {iso} has no totals")
            continue
        latest = max(years)
        value = years[latest].get("x")
        if value is None:
            problems.append(f"anchor country {iso} has no export total for {latest}")
        elif not (lo <= value <= hi):
            problems.append(f"anchor {iso} {latest} exports ${value:,.0f} outside expected ${lo:,.0f}-${hi:,.0f}")

    return problems


# ---------------------------------------------------------------- publish

def publish(data: dict, vintage: str) -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    def write(name: str, payload) -> None:
        path = OUT / name
        path.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
        print(f"  {name:24s} {path.stat().st_size / 1024:>8.0f} KB")

    latest_year = max(
        (int(y) for years in data["totals"].values() for y in years),
        default=0,
    )

    write("countries.json", list(data["countries"].values()))
    write("totals.json", data["totals"])
    write("bilateral.json", data["bilateral"])
    # `codes` travels WITH the data rather than being implied by a shared constant. The
    # payload is index-encoded, so a reader that resolved indexes against its own copy of
    # the catalogue would mislabel every figure the moment the two drifted apart.
    write(
        "bilateral_sectors.json",
        {"codes": list(SECTOR_LABELS), "flows": data["bilateral_sectors"]},
    )
    # Derived, not measured. Its own file so nothing downstream can read a mirror figure
    # while thinking it holds a reported one - the UI has to ask for it by name.
    write(
        "mirror.json",
        {
            "codes": list(SECTOR_LABELS),
            "method": (
                "Rebuilt from partner reports for economies that file nothing themselves. "
                "Every export from one country is an import to another, so a silent "
                "country's trade is the sum of what its partners say about it. Derived, "
                "not reported: valuation basis, timing and re-export treatment all differ "
                "between the partners contributing to a single figure."
            ),
            "year": latest_year,
            "countries": data["mirror"],
        },
    )
    write("products.json", data["products"])
    write("tariffs.json", data["tariffs"])
    write("context.json", data["context"])

    meta = {
        "vintage": vintage,
        "built_at": datetime.now(timezone.utc).isoformat(),
        "latest_year": latest_year,
        "sources": [
            {
                "name": "World Bank WITS",
                "datasets": ["tradestats-trade", "tradestats-tariff"],
                "url": "https://wits.worldbank.org/",
                "license": "CC-BY-4.0",
            },
            {
                "name": "World Bank Open Data",
                "datasets": ["country reference", "WDI"],
                "url": "https://data.worldbank.org/",
                "license": "CC-BY-4.0",
            },
        ],
        "units": {
            "trade_values": "USD (converted from WITS thousands-USD at conform)",
            "tariffs": "percent, effectively applied, simple average",
        },
        "caveats": [
            "WITS product groups are HS-section aggregates, not HS-6 lines. HS-6 drill-down requires UN Comtrade.",
            "Bilateral detail covers the latest complete year only; time series are world-total.",
            "Corridor-level sector figures come from a separate WITS aggregation than corridor totals, so a corridor's sector slices do not always sum exactly to its reported total. Neither is adjusted to fit the other.",
            "Reported exports from A to B routinely differ from B's reported imports from A (CIF/FOB valuation, timing, transshipment). Both figures are shown where available rather than reconciled.",
            "Re-export hubs (Singapore, Netherlands, Hong Kong, UAE) report transit volumes as their own trade.",
            "Tariff figures are simple averages across products and hide wide dispersion within a partner relationship.",
            "Absent data means not reported, not zero. The two are kept distinct throughout.",
            "61 economies file no trade report at all (Russia, Iraq, Bangladesh, Algeria and others). Their figures in mirror.json are rebuilt from partner reports and are estimates, labelled as such wherever shown, and never merged into the reported totals.",
        ],
        "stats": data["stats"],
        "reconciliation_warnings": data.get("reconcile_failures", []),
    }
    write("meta.json", meta)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--vintage", required=True)
    ap.add_argument("--allow-warnings", action="store_true", help="publish despite validation problems")
    args = ap.parse_args()

    print(f"building from raw vintage {args.vintage}")
    data = build(args.vintage)

    print("\nstats:")
    for key, value in data["stats"].items():
        print(f"  {key}: {value}")

    problems = validate(data)
    if problems:
        print(f"\nVALIDATION: {len(problems)} problem(s)", file=sys.stderr)
        for p in problems[:20]:
            print(f"  - {p}", file=sys.stderr)
        if not args.allow_warnings:
            raise SystemExit("refusing to publish -- rerun with --allow-warnings to override")
    else:
        print("\nVALIDATION: clean")

    print("\npublishing:")
    publish(data, args.vintage)
    print("\ndone")


if __name__ == "__main__":
    main()
