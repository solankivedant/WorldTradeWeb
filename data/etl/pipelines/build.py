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
from collections import Counter, defaultdict
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

    # What year THIS vintage asked the tariff endpoint for. Read from the vintage's own
    # sidecar rather than from the connector's current constant: a vintage fetched months
    # ago must be validated against the year it was actually fetched with, not against
    # whatever the connector happens to say today. `latest_tariff_year` postdates the
    # trade/tariff split, so vintages fetched before it fall back to the shared year.
    raw_meta_path = wits_dir / "_meta.json"
    raw_meta = json.loads(raw_meta_path.read_text(encoding="utf-8")) if raw_meta_path.exists() else {}
    raw_years = raw_meta.get("years", {})
    tariff_year_requested = raw_years.get("latest_tariff_year", raw_years.get("latest_detail_year"))

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
    # The year the tariff rows actually CARRY, counted per reporter rather than assumed
    # from the year the connector asked for. Trade and tariffs are separate WITS datasets
    # on separate release cycles, so the tariff vintage has to be read out of the tariff
    # data - inheriting the trade frontier is how a rate gets published under the wrong
    # year without anything failing.
    tariff_years: Counter[str] = Counter()
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
                tariff_years[str(row.get("YEAR", ""))] += 1
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

    context_layer = conform_context(valid_iso, stats)

    return {
        "countries": countries,
        "totals": totals,
        "bilateral": bilateral,
        "bilateral_sectors": bilateral_sectors,
        "mirror": mirror,
        "products": products,
        "tariffs": tariffs,
        # Sole tariff year if every row agrees, else None - `validate` refuses a mixed
        # vintage rather than picking one, because there is no honest way to label a
        # table whose rows come from different years.
        "tariff_year": int(next(iter(tariff_years))) if len(tariff_years) == 1 else None,
        "tariff_years_seen": dict(tariff_years),
        "tariff_year_requested": tariff_year_requested,
        "context": context,
        "indicators": context_layer,
        "stats": stats,
        "reconcile_failures": [],
    }


# ------------------------------------------------------- conform: context layer

# How many decimals each unit keeps. Money to the dollar: a services figure carrying
# fourteen significant digits is false precision and costs a third of the file.
UNIT_PRECISION = {
    "usd": 0,
    "teu": 0,
    "days": 1,
    "index": 4,
    "score": 4,
    "percent": 3,
    "lcu-per-usd": 4,
}


def conform_context(valid_iso: set[str], stats: dict) -> dict:
    """Map the World Bank context layer onto our country set and our own keys.

    The catalogue travels with the data, exactly as `codes` does inside
    bilateral_sectors.json. A published figure and the sentence explaining what it
    measures must not be able to drift apart, and they will the moment the meaning lives
    in a constant somewhere else in the repo.

    Everything here is COUNTRY-level and none of it is customs data. It is published to
    its own file, keyed by its own names, so nothing can pick up a services figure while
    reaching for goods.
    """
    path = RAW / "worldbank" / "context.json"
    if not path.exists():
        print("  no raw context layer -- run: python data/etl/connectors/worldbank.py --context-only")
        return {"catalog": [], "families": {}, "series": {}, "frontiers": {}}

    raw = json.loads(path.read_text(encoding="utf-8"))
    catalog = raw.get("catalog", [])
    by_code = {spec["code"]: spec for spec in catalog}

    series: dict[str, dict[str, dict[str, float]]] = defaultdict(dict)
    frontiers: dict[str, int] = {}
    dropped_entities: dict[str, int] = defaultdict(int)
    kept_values = 0

    for code, by_iso in raw.get("series", {}).items():
        spec = by_code.get(code)
        if spec is None:
            # A code in the data with no catalogue entry is a figure nobody can label.
            stats["context_codes_uncatalogued"] = stats.get("context_codes_uncatalogued", 0) + 1
            print(f"  !! context: {code} has no catalogue entry, dropped")
            continue
        key = spec["key"]
        digits = UNIT_PRECISION.get(spec["unit"], 4)
        newest: int | None = None

        for iso_raw, by_year in by_iso.items():
            # The World Bank emits modern ISO3, but normalize anyway: the day it emits a
            # superseded code is the day six countries quietly lose their context.
            iso = LEGACY_ISO3.get(iso_raw.upper(), iso_raw.upper())
            if iso not in valid_iso:
                # Aggregates ("World", "Euro area", "Low income") and territories outside
                # the reference table. Counted, never silently dropped.
                dropped_entities[iso] += 1
                continue
            clean = {}
            for year, value in by_year.items():
                if value is None:
                    continue  # not reported stays absent; it is not a zero
                rounded = round(float(value), digits)
                clean[year] = int(rounded) if digits == 0 else rounded
                year_int = int(year)
                if newest is None or year_int > newest:
                    newest = year_int
            if clean:
                series[iso][key] = clean
                kept_values += len(clean)

        if newest is not None:
            frontiers[key] = newest

    stats["context_series"] = len(catalog)
    stats["context_values"] = kept_values
    stats["context_countries"] = len(series)
    stats["context_entities_dropped"] = sum(dropped_entities.values())
    if dropped_entities:
        top = sorted(dropped_entities.items(), key=lambda kv: -kv[1])[:8]
        print(
            f"  context: dropped {len(dropped_entities)} non-country entities "
            f"({stats['context_entities_dropped']} series-values), e.g. "
            + ", ".join(f"{iso}x{n}" for iso, n in top)
        )

    return {
        "catalog": catalog,
        "families": raw.get("families", {}),
        # Each series' own newest year. They disagree by up to six years, and a reader
        # who assumes one shared frontier will read a 2018 lead time as current.
        "frontiers": frontiers,
        "series": dict(series),
    }


# ---------------------------------------------------------------- validate

def validate(data: dict) -> list[str]:
    """Assert the published shape before writing. Range checks matter as much as types."""
    problems: list[str] = []

    if len(data["countries"]) < 150:
        problems.append(f"only {len(data['countries'])} countries -- reference table looks truncated")

    if data["stats"]["bilateral_rows"] < 10_000:
        problems.append(f"only {data['stats']['bilateral_rows']} bilateral rows -- fetch likely incomplete")

    # Vintage is part of a figure's identity, so a tariff table that cannot name its own
    # year is not publishable. Two ways it fails: no year at all, or rows from more than
    # one year mixed together - which would happen if a future WITS response widened a
    # single-year request to the nearest available year for some reporters and not others.
    if data["tariffs"]:
        if data["tariff_year"] is None:
            problems.append(
                "tariff rows carry more than one year "
                f"{data['tariff_years_seen']} -- refusing to publish a table that cannot "
                "state its own vintage"
            )
        elif (
            data["tariff_year_requested"] is not None
            and data["tariff_year"] != data["tariff_year_requested"]
        ):
            problems.append(
                f"tariffs came back as {data['tariff_year']} but this vintage requested "
                f"{data['tariff_year_requested']} -- the source substituted a different "
                "year; fix TARIFF_LATEST in the connector and refetch into a NEW vintage "
                "(the fetcher skips files already on disk, so reusing this one changes "
                "nothing)"
            )

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

    problems.extend(validate_context(data["indicators"]))

    return problems


# Figures checkable against a published World Bank country page. Ranges are wide enough
# to survive a revision and narrow enough to catch a units error, which is the failure
# mode that matters: a remittance figure off by 1000x looks entirely plausible.
CONTEXT_ANCHORS = [
    ("IND", "remittances_in", 1.0e11, 1.5e11, "India is the largest remittance recipient, ~$120-140B"),
    ("IND", "services_exports", 2.5e11, 4.5e11, "India services exports ~$340-380B"),
    ("USA", "services_exports", 8.0e11, 1.3e12, "USA services exports ~$1.0T"),
    ("SGP", "shipping_connectivity", 80.0, 200.0, "Singapore is the top-connected port"),
    ("DEU", "lpi_overall", 3.5, 5.0, "Germany scores at the top of the LPI"),
]


def validate_context(layer: dict) -> list[str]:
    """Range checks on the context layer. Types are the easy half; units are the bugs."""
    problems: list[str] = []
    catalog = layer.get("catalog", [])
    series = layer.get("series", {})
    if not catalog:
        # Not fatal - a build from a vintage fetched before this layer existed is still
        # a valid build. It just publishes an empty layer, and the UI shows nothing.
        return problems

    if len(series) < 150:
        problems.append(f"context layer covers only {len(series)} countries -- fetch looks truncated")

    by_key = {spec["key"]: spec for spec in catalog}
    for iso, values in series.items():
        for key, by_year in values.items():
            spec = by_key.get(key)
            if spec is None:
                problems.append(f"context {iso}/{key}: no catalogue entry")
                continue
            lo, hi = spec.get("range", (None, None)) if spec.get("range") else (None, None)
            for year, value in by_year.items():
                if not (2000 <= int(year) <= 2035):
                    problems.append(f"context {iso}/{key}: year {year} out of range")
                if lo is not None and not (lo <= value <= hi):
                    problems.append(f"context {iso}/{key}/{year}: {value} outside documented range {lo}..{hi}")
                # FDI and remittances are net flows and legitimately go negative;
                # a negative services export or port throughput is a units bug.
                if spec["unit"] in ("usd", "teu") and value < 0 and spec["family"] == "services":
                    problems.append(f"context {iso}/{key}/{year}: negative {spec['unit']} value {value}")

    for iso, key, lo, hi, why in CONTEXT_ANCHORS:
        by_year = series.get(iso, {}).get(key)
        if not by_year:
            problems.append(f"context anchor {iso}/{key} missing ({why})")
            continue
        latest = max(by_year)
        value = by_year[latest]
        if not (lo <= value <= hi):
            problems.append(
                f"context anchor {iso}/{key} {latest} = {value:,.2f}, expected {lo:,.0f}..{hi:,.0f} ({why})"
            )

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
    # The context layer ships with its own catalogue, its own per-series frontier years
    # and its own file. None of it is customs data and none of it may be added to a goods
    # total, which is easiest to guarantee by never putting it in the same payload.
    write("indicators.json", data["indicators"])

    meta = {
        "vintage": vintage,
        "built_at": datetime.now(timezone.utc).isoformat(),
        "latest_year": latest_year,
        # Read from the tariff rows, never inherited from `latest_year`. The two are
        # separate WITS datasets and are free to sit at different years.
        "tariff_year": data["tariff_year"],
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
            {
                "name": "World Bank WDI context layer",
                "datasets": [
                    "services trade (BoP)",
                    "FDI and remittances (BoP)",
                    "Logistics Performance Index",
                    "UNCTAD Liner Shipping Connectivity Index",
                    "Worldwide Governance Indicators",
                    "prices, deflator and exchange rate",
                ],
                "url": "https://data.worldbank.org/",
                "license": "CC-BY-4.0",
            },
        ],
        "units": {
            "trade_values": "USD (converted from WITS thousands-USD at conform)",
            "tariffs": "percent, effectively applied, simple average",
            "context_layer": (
                "each series carries its own unit and basis in indicators.json; money is "
                "USD, indices and scores keep the source's scale"
            ),
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
            "Services, investment and remittance figures are balance-of-payments data, a different measurement basis from the customs records behind every goods figure. They are never added to goods trade, and no bilateral breakdown of them exists at this tier.",
            "Context series run to different newest years than the goods data: services and governance reach 2024, goods stop at 2023, logistics scores at 2022, shipping connectivity at 2021 and lead times at 2018. Each figure is shown with the year it belongs to.",
            "Logistics and lead-time scores are surveys of freight forwarders' perceptions, and governance scores are composites of many underlying sources. Both are ordinal reads, not measurements, and small differences between countries are not meaningful.",
            "No inventory of non-tariff measures is published here. The WTO I-TIP and UNCTAD TRAINS NTM datasets are not publicly reachable without credentials, so the customs-efficiency score stands in as a proxy for border friction and counts nobody's certificates, quotas or standards.",
            "Corridor-level freight rates are commercial data this project does not license. Shipping connectivity and port throughput describe a country's position in the network, not the cost of any particular route.",
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
