"""WITS (World Bank World Integrated Trade Solution) connector.

Source:   https://wits.worldbank.org/API/V1/SDMX/V21/datasource/...
Auth:     none required
License:  World Bank open data terms (CC-BY-4.0)

WHAT THIS SOURCE ACTUALLY GIVES YOU (verified against live responses, not docs):

  - Identifiers are ISO 3166-1 alpha-3 already. No code translation needed, which is
    unusual and welcome. `wld` is the world aggregate partner.
  - Trade values are in THOUSANDS of USD. Conversion to USD happens in the conform
    stage, never here.
  - Tariff rates are percent (0-100+), simple average of applied rates.
  - Products are NOT raw HS codes. WITS returns 29 named product groups spanning HS
    sections (e.g. "27-27_Fuels", "28-38_Chemicals"). This sidesteps the HS revision
    concordance problem entirely for V1 -- the groups are revision-stable. It also
    means we cannot do HS-6 drill-down from this source; that needs Comtrade.
  - `partner/all` returns ~231 partners in one response, so bilateral data costs one
    request per reporter, not one per pair.
  - A year range (`2010;2022`) returns every year in between, so a full time series
    is also one request.
  - Some reporters return HTTP 200 with zero series. That is "does not report", not an
    error. Recorded as such, never as zero.

This module ONLY fetches and writes raw responses plus a provenance sidecar.
No cleaning, no reshaping, no unit conversion. See .claude/rules/data-integrity.md.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

import urllib.error
import urllib.request

BASE = "https://wits.worldbank.org/API/V1/SDMX/V21/datasource"

# WITS still uses several superseded ISO 3166-1 alpha-3 codes. Requesting the modern
# code returns an empty 200 -- which looks exactly like "this country does not report"
# and silently erased six real economies from the first build. Requests go out under
# the WITS code; responses are normalized back to modern ISO3 at conform.
ISO3_TO_WITS = {
    "ROU": "rom",  # Romania
    "SRB": "ser",  # Serbia
    "SDN": "sud",  # Sudan
    "COD": "zar",  # Congo, Dem. Rep. (ex-Zaire)
    "MNE": "mnt",  # Montenegro
    "TLS": "tmp",  # Timor-Leste (ex-East Timor)
}
RAW_ROOT = Path(__file__).resolve().parents[2] / "raw" / "wits"

# Years with reasonably complete WITS coverage. WITS lags ~2-3 years.
YEAR_FROM = 2010
YEAR_TO = 2022
LATEST = 2022

TIMEOUT = 60
MAX_RETRIES = 3
WORKERS = 6


def _url(datasource: str, reporter: str, year: str, partner: str, product: str, indicator: str) -> str:
    return (
        f"{BASE}/{datasource}/reporter/{reporter}/year/{year}"
        f"/partner/{partner}/product/{product}/indicator/{indicator}?format=JSON"
    )


def fetch(url: str) -> dict | None:
    """GET with backoff. Returns parsed JSON, or None if the source has no data.

    Distinguishes three outcomes deliberately:
      dict  -> data returned (may still contain zero series; that is the caller's problem)
      None  -> source responded but has nothing for this key (a valid, reportable state)
      raise -> transport failure after retries (a real error, must not be silently swallowed)
    """
    last_err: Exception | None = None
    for attempt in range(MAX_RETRIES):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "TradeCenter-ETL/0.1"})
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                body = resp.read()
            if not body.strip():
                return None
            return json.loads(body)
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                return None
            last_err = exc
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as exc:
            last_err = exc
        time.sleep(2 ** attempt)
    raise RuntimeError(f"failed after {MAX_RETRIES} attempts: {url}") from last_err


def jobs_for(reporter: str) -> list[tuple[str, str]]:
    """The seven requests that fully describe one reporter country."""
    r = ISO3_TO_WITS.get(reporter.upper(), reporter.lower())
    span = f"{YEAR_FROM};{YEAR_TO}"
    return [
        # name                          url
        ("totals_export", _url("tradestats-trade", r, span, "wld", "total", "XPRT-TRD-VL")),
        ("totals_import", _url("tradestats-trade", r, span, "wld", "total", "MPRT-TRD-VL")),
        ("bilateral_export", _url("tradestats-trade", r, str(LATEST), "all", "total", "XPRT-TRD-VL")),
        ("bilateral_import", _url("tradestats-trade", r, str(LATEST), "all", "total", "MPRT-TRD-VL")),
        ("products_export", _url("tradestats-trade", r, str(LATEST), "wld", "all", "XPRT-TRD-VL")),
        ("products_import", _url("tradestats-trade", r, str(LATEST), "wld", "all", "MPRT-TRD-VL")),
        ("tariffs", _url("tradestats-tariff", r, str(LATEST), "all", "total", "AHS-SMPL-AVRG")),
    ]


def fetch_reporter(reporter: str, out_dir: Path) -> dict:
    """Fetch all seven datasets for one reporter. Resumable: skips files already on disk."""
    dest = out_dir / reporter
    dest.mkdir(parents=True, exist_ok=True)
    result = {"reporter": reporter, "ok": [], "empty": [], "failed": []}

    for name, url in jobs_for(reporter):
        target = dest / f"{name}.json"
        if target.exists():
            result["ok"].append(name)
            continue
        try:
            payload = fetch(url)
        except RuntimeError as exc:
            print(f"  ! {reporter}/{name}: {exc}", file=sys.stderr)
            result["failed"].append(name)
            continue
        if payload is None:
            # Not reported. Record the absence explicitly so the conform stage can tell
            # "no data" from "zero" -- these must never collapse into each other.
            target.write_text(json.dumps({"_no_data": True, "_url": url}), encoding="utf-8")
            result["empty"].append(name)
            continue
        target.write_text(json.dumps(payload), encoding="utf-8")
        result["ok"].append(name)

    return result


def load_reporters() -> list[str]:
    """Reporter list comes from the World Bank country reference already on disk."""
    ref = RAW_ROOT.parent / "worldbank" / "countries.json"
    if not ref.exists():
        raise SystemExit("run connectors/worldbank.py first -- reporter list comes from it")
    countries = json.loads(ref.read_text(encoding="utf-8"))
    return [c["iso3"] for c in countries if c.get("is_country")]


def main() -> None:
    ap = argparse.ArgumentParser(description="Fetch raw WITS trade + tariff data")
    ap.add_argument("--vintage", default=datetime.now(timezone.utc).strftime("%Y%m%d"))
    ap.add_argument("--limit", type=int, default=0, help="fetch only the first N reporters")
    ap.add_argument("--workers", type=int, default=WORKERS)
    args = ap.parse_args()

    reporters = load_reporters()
    if args.limit:
        reporters = reporters[: args.limit]

    out_dir = RAW_ROOT / args.vintage
    out_dir.mkdir(parents=True, exist_ok=True)
    started = datetime.now(timezone.utc)
    print(f"WITS fetch: {len(reporters)} reporters -> {out_dir}", flush=True)

    summary = {"ok": 0, "empty": 0, "failed": 0}
    done = 0
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(fetch_reporter, r, out_dir): r for r in reporters}
        for fut in as_completed(futures):
            res = fut.result()
            summary["ok"] += len(res["ok"])
            summary["empty"] += len(res["empty"])
            summary["failed"] += len(res["failed"])
            done += 1
            if done % 10 == 0 or done == len(reporters):
                print(f"  {done}/{len(reporters)} reporters", flush=True)

    # Provenance sidecar. Every raw drop carries one; the API `meta` block cites it.
    (out_dir / "_meta.json").write_text(
        json.dumps(
            {
                "source": "World Bank WITS",
                "datasources": ["tradestats-trade", "tradestats-tariff"],
                "base_url": BASE,
                "indicators": {
                    "XPRT-TRD-VL": "Export trade value, thousands USD",
                    "MPRT-TRD-VL": "Import trade value, thousands USD",
                    "AHS-SMPL-AVRG": "Effectively applied tariff, simple average, percent",
                },
                "years": {"from": YEAR_FROM, "to": YEAR_TO, "latest_detail_year": LATEST},
                "reporters_requested": len(reporters),
                "retrieved_at": started.isoformat(),
                "completed_at": datetime.now(timezone.utc).isoformat(),
                "request_summary": summary,
                "units_note": "Trade values are THOUSANDS of USD as delivered. Conversion happens in conform, not here.",
                "license": "CC-BY-4.0, World Bank open data terms",
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"done: {summary}", flush=True)


if __name__ == "__main__":
    main()
