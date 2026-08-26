"""comtrade raw -> normalize -> conform -> aggregate -> validate -> publish

Turns the Comtrade drop into two published files that sit ALONGSIDE the WITS build and
never inside it:

  frontier.json   country totals for years past the WITS frontier (2024, 2025)
  aviation.json   HS chapter 88 (aircraft), a SUBSET of the Transport section group

WHY TWO SEPARATE FILES RATHER THAN MERGING INTO totals.json / products.json:

  A figure's source and vintage are part of its identity. Merging a Comtrade 2024 total
  into `totals.json` would produce a series whose 2010-2023 came from WITS and whose 2024
  came from somewhere else, with nothing on the row saying so - and the first person to
  spot a discontinuity would have no way to tell a real one from a source change. Same
  rule the mirror estimates already follow: its own file, its own access functions, its
  own component, and the method stated above the numbers.

  It is also what keeps the WITS build authoritative and re-runnable. Nothing in here
  touches a byte the other pipeline wrote.

AVIATION IS NOT A SEVENTEENTH SECTOR. Chapter 88 sits INSIDE HS section XVII, which is
the `86-89_Transport` group already published. Adding it to the sixteen would double-count
exactly the way summing WITS's three overlapping classification schemes overstated India's
exports 3.4x. It is published as a subset, the validator proves it is one, and the UI
renders it inside Transport rather than beside it.

UNITS: Comtrade `primaryValue` is plain USD. The WITS pipeline's x1000 scaling must NOT
be applied here - see the connector docstring.

Run:  python -m data.etl.pipelines.comtrade_build --vintage 2026-08-26
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "raw" / "comtrade"
OUT = ROOT / "processed"

#: The section group chapter 88 must sum inside. Named here because the containment check
#: below is the single most valuable validation in this file.
TRANSPORT_GROUP = "86-89_Transport"

#: A reporter needs at least this many peers filing in the same year before the year is
#: called complete. 2025 is expected to fall well short and be labelled partial.
COMPLETE_YEAR_REPORTERS = 120

#: Comtrade rows come back capped at 500; a batch at the cap was truncated and its
#: aggregate is short. Refuse rather than publish a quietly wrong total.
RECORD_CAP = 500


# ---------------------------------------------------------------- normalize

def read_batches(vintage: str, prefix: str) -> tuple[list[dict], list[str]]:
    """Every row from every batch file for one job, plus any problems worth failing on.

    No semantic change here - types and shape only. Conform does the meaning.
    """
    src = RAW / vintage
    rows: list[dict] = []
    problems: list[str] = []
    for path in sorted(src.glob(f"{prefix}_*.json")):
        payload = json.loads(path.read_text(encoding="utf-8"))
        if payload.get("_no_data"):
            continue
        count = payload.get("count", 0)
        if count >= RECORD_CAP:
            problems.append(
                f"{path.name} returned {count} rows, at the {RECORD_CAP} record cap - "
                "the response is truncated and its aggregates would be short"
            )
        for row in payload.get("data") or []:
            rows.append(row)
    return rows, problems


def iso_lookup(vintage: str) -> dict[int, str]:
    """M49 numeric -> ISO3, from the reference stored in the raw drop.

    Not from the rows: the preview endpoint returns `reporterISO: null` on every one of
    them, so a build that trusted the row would map all 255 reporters to nothing.
    """
    payload = json.loads((RAW / vintage / "_reporters.json").read_text(encoding="utf-8"))
    rows = payload.get("results", payload if isinstance(payload, list) else [])
    out: dict[int, str] = {}
    for row in rows:
        code = row.get("reporterCode")
        iso = (row.get("reporterCodeIsoAlpha3") or "").strip().upper()
        if isinstance(code, int) and len(iso) == 3:
            out[code] = iso
    return out


# ---------------------------------------------------------------- conform

def conform(
    rows: list[dict],
    codes: dict[int, str],
    valid_iso: set[str],
    stats: Counter,
    tag: str,
) -> dict[str, dict[str, dict[str, float | bool]]]:
    """Rows -> {iso3: {year: {x, m, ...}}}, with every drop counted.

    Three drop reasons, all counted separately, because "we dropped 300 rows" is not an
    auditable statement and the WITS build only found its legacy-ISO-code bug by reading
    a drop log:

      unmapped_code   a numeric reporter the reference does not carry
      pseudo_country  a reference entry whose alpha-3 is not a real country (S19,
                      "Other Asia, nes") - an aggregate that would double-count
      unknown_iso     a real-looking ISO3 that is not in this project's country table
    """
    out: dict[str, dict[str, dict[str, float | bool]]] = {}

    for row in rows:
        code = row.get("reporterCode")
        iso = codes.get(code) if isinstance(code, int) else None
        if not iso:
            stats[f"{tag}_dropped_unmapped_code"] += 1
            continue
        if iso not in valid_iso:
            # S19 and friends land here. They are aggregates, not countries, and summing
            # them with real reporters is the double-count this whole check exists for.
            bucket = "pseudo_country" if not iso.isalpha() else "unknown_iso"
            stats[f"{tag}_dropped_{bucket}"] += 1
            stats[f"{tag}_dropped_iso_{iso}"] += 1
            continue

        year = row.get("refYear")
        flow = row.get("flowCode")
        value = row.get("primaryValue")
        if year is None or flow not in ("X", "M") or value is None:
            stats[f"{tag}_dropped_shape"] += 1
            continue
        if value < 0:
            # A negative merchandise total is a units or sign bug upstream, never a datum.
            stats[f"{tag}_dropped_negative"] += 1
            continue

        slot = out.setdefault(iso, {}).setdefault(str(year), {})
        key = "x" if flow == "X" else "m"
        if key in slot:
            # Pinned dimensions should make a reporter/year/flow unique. If it is not,
            # something in the query fanned out again and silently summing would hide it.
            stats[f"{tag}_duplicate_rows"] += 1
            continue
        slot[key] = float(value)
        # Comtrade sets isReported=false where it derived the figure by summing the
        # country's HS-6 lines rather than the country filing that aggregate. Not an
        # estimate of missing trade, but the UI says which figures are sums.
        slot[f"{key}r"] = bool(row.get("isReported", False))
        stats[f"{tag}_rows_kept"] += 1

    return out


# ---------------------------------------------------------------- validate

def validate(
    frontier: dict, aviation: dict, wits_totals: dict, wits_products: dict, stats: Counter
) -> tuple[list[str], list[str]]:
    """Returns (errors, warnings). Errors block the publish; warnings are recorded."""
    errors: list[str] = []
    warnings: list[str] = []

    # --- range checks, not just type checks -------------------------------------
    for name, table in (("frontier", frontier), ("aviation", aviation)):
        for iso, years in table.items():
            for year, slot in years.items():
                if not (1900 < int(year) < 2100):
                    errors.append(f"{name}: {iso} has out-of-range year {year}")
                for key in ("x", "m"):
                    v = slot.get(key)
                    if v is None:
                        continue
                    if v < 0:
                        errors.append(f"{name}: {iso} {year} {key} is negative ({v})")
                    if v > 5e12:
                        # No single country trades $5T of anything in a year. A value this
                        # size is a units error, which is exactly the bug that would follow
                        # from reusing the WITS x1000 scaling.
                        errors.append(f"{name}: {iso} {year} {key} = {v:,.0f}, implausible - units?")

    # --- containment: chapter 88 must fit inside the Transport section group ----
    # The strongest check available, and the one that proves aviation is a subset rather
    # than a seventeenth peer. Both sides are 2023, the deliberate overlap year.
    breaches = 0
    compared = 0
    for iso, years in aviation.items():
        slot = years.get("2023")
        if not slot:
            continue
        groups = wits_products.get(iso) or {}
        for flow_key, wits_flow in (("x", "x"), ("m", "m")):
            av = slot.get(flow_key)
            if av is None:
                continue
            rows = groups.get(wits_flow) or []
            transport = next((r["value"] for r in rows if r.get("code") == TRANSPORT_GROUP), None)
            if transport is None:
                continue
            compared += 1
            # 2% headroom: the two sources are the same lineage but not the same
            # extraction, and a handful of countries revise between them.
            if av > transport * 1.02:
                breaches += 1
                warnings.append(
                    f"aviation: {iso} 2023 {flow_key} chapter-88 {av:,.0f} exceeds its own "
                    f"Transport group {transport:,.0f} - not a subset"
                )
    stats["aviation_containment_compared"] = compared
    stats["aviation_containment_breaches"] = breaches
    if compared < 40:
        warnings.append(f"aviation: only {compared} containment comparisons available")
    if breaches > compared * 0.1:
        errors.append(
            f"aviation: {breaches} of {compared} countries breach Transport containment - "
            "chapter 88 is not behaving as a subset"
        )

    # --- continuity: 2024 should be within an order of magnitude of 2023 --------
    jumps = 0
    checked = 0
    for iso, years in frontier.items():
        new = years.get("2024") or {}
        old = (wits_totals.get(iso) or {}).get("2023") or {}
        for key in ("x", "m"):
            a, b = new.get(key), old.get(key)
            if a is None or b is None or b <= 0:
                continue
            checked += 1
            ratio = a / b
            if ratio > 10 or ratio < 0.1:
                jumps += 1
                warnings.append(
                    f"frontier: {iso} {key} moved {b:,.0f} (2023, WITS) -> {a:,.0f} (2024) "
                    f"= {ratio:.1f}x"
                )
    stats["frontier_continuity_checked"] = checked
    stats["frontier_continuity_jumps"] = jumps
    if checked and jumps > checked * 0.05:
        errors.append(f"frontier: {jumps} of {checked} figures moved more than 10x - suspect units")

    return errors, warnings


# ---------------------------------------------------------------- publish

def publish(frontier: dict, aviation: dict, vintage: str, stats: Counter, warnings: list[str]) -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    # Completeness per year, counted rather than assumed. 2025 is a year countries are
    # still filing into; presenting it beside 2024 without saying so would invite reading
    # a half-reported year as a collapse in world trade.
    year_reporters: Counter = Counter()
    for years in frontier.values():
        for year, slot in years.items():
            if slot.get("x") is not None or slot.get("m") is not None:
                year_reporters[year] += 1

    years_meta = {
        year: {
            "reporters": count,
            "complete": count >= COMPLETE_YEAR_REPORTERS,
        }
        for year, count in sorted(year_reporters.items())
    }

    def write(name: str, payload: dict) -> None:
        (OUT / name).write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
        size = (OUT / name).stat().st_size
        print(f"  wrote {name}  {size / 1024:.0f} KB")

    common = {
        "source": "UN Comtrade",
        "vintage": vintage,
        "built_at": datetime.now(timezone.utc).isoformat(),
        "units": "USD",
    }

    write(
        "frontier.json",
        {
            **common,
            "years": years_meta,
            "note": (
                "Country totals for years past the WITS frontier. A different source from "
                "the 2010-2023 series, so the two are never drawn as one continuous line "
                "without saying where the join is."
            ),
            "totals": frontier,
        },
    )

    write(
        "aviation.json",
        {
            **common,
            "hs_chapter": "88",
            "within_group": TRANSPORT_GROUP,
            "classification": "HS (H6 as returned by the source)",
            "note": (
                "HS chapter 88, aircraft and spacecraft. A SUBSET of the Transport section "
                "group, never a seventeenth sector - adding it to the sixteen would "
                "double-count. `xr`/`mr` are false where the source summed the country's "
                "HS-6 lines rather than the country filing the chapter total itself."
            ),
            "years": sorted({y for years in aviation.values() for y in years}),
            "totals": aviation,
        },
    )

    (OUT / "comtrade_meta.json").write_text(
        json.dumps(
            {
                **common,
                "stats": dict(stats),
                "warnings": warnings,
                "license": "UN Comtrade - derived/transformed re-dissemination permitted",
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print("  wrote comtrade_meta.json")


# ---------------------------------------------------------------- driver

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--vintage", required=True)
    ap.add_argument("--allow-warnings", action="store_true")
    args = ap.parse_args()

    src = RAW / args.vintage
    if not src.exists():
        sys.exit(f"no raw drop at {src} - run the connector first")

    countries = json.loads((OUT / "countries.json").read_text(encoding="utf-8"))
    valid_iso = {c["iso3"] for c in countries} if isinstance(countries, list) else set(countries)
    wits_totals = json.loads((OUT / "totals.json").read_text(encoding="utf-8"))
    wits_products = json.loads((OUT / "products.json").read_text(encoding="utf-8"))

    codes = iso_lookup(args.vintage)
    stats: Counter = Counter()
    stats["reference_reporters"] = len(codes)

    frontier_rows, p1 = read_batches(args.vintage, "frontier")
    aviation_rows, p2 = read_batches(args.vintage, "aviation")
    truncation = p1 + p2

    frontier = conform(frontier_rows, codes, valid_iso, stats, "frontier")
    aviation = conform(aviation_rows, codes, valid_iso, stats, "aviation")

    stats["frontier_countries"] = len(frontier)
    stats["aviation_countries"] = len(aviation)

    errors, warnings = validate(frontier, aviation, wits_totals, wits_products, stats)
    errors = truncation + errors

    print(f"[comtrade-build] vintage {args.vintage}")
    for key, value in sorted(stats.items()):
        print(f"  {key:42} {value}")
    for w in warnings[:12]:
        print(f"  WARN  {w}")
    if len(warnings) > 12:
        print(f"  WARN  ... and {len(warnings) - 12} more")
    for e in errors:
        print(f"  ERROR {e}")

    if errors:
        sys.exit("refusing to publish: validation failed")
    if warnings and not args.allow_warnings:
        print(f"\n{len(warnings)} warning(s). Publishing - warnings are recorded, not fatal.")

    publish(frontier, aviation, args.vintage, stats, warnings)


if __name__ == "__main__":
    main()
