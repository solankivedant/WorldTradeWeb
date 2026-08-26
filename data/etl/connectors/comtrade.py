"""UN Comtrade -> data/raw/comtrade/<vintage>/

A SECOND trade source, added for two things WITS cannot serve:

  1. THE FRONTIER. WITS stops at 2023 and returns HTTP 404 for 2024 and 2025 for every
     reporter tested (usa, deu, ind, chn, verified live 2026-08-26). Comtrade has both.
  2. CHAPTER DETAIL. WITS `tradestats-trade` accepts only its sixteen section-group codes
     plus `total`; `product/88` returns HTTP 400. Comtrade serves HS chapters, which is
     the only way to get aircraft (chapter 88) out of the Transport section group.

WHAT A SAMPLE ACTUALLY LOOKS LIKE (data/raw/_samples/comtrade_hs88_2023.json), because
the documentation does not tell you any of this:

  - COUNTRY IDENTIFIER is the M49 numeric `reporterCode`. The preview endpoint returns
    `reporterISO: null` and `reporterDesc: null` on every row - it strips descriptive
    fields - so the numeric code MUST be resolved through the Reporters reference file,
    which is fetched and stored alongside the data as part of the raw drop. Reading an
    ISO code off a row gets you None for all 255 reporters.
  - PRODUCT IDENTIFIER is `cmdCode` under `classificationCode: "H6"` - HS revision 6.
    Chapter 88 has meant aircraft in every revision H0-H6, so this particular code is
    revision-stable and comparable with the 2023 WITS build; that is why chapter 88 is
    safe to add and an arbitrary HS-6 line would not be.
  - AGGREGATE PSEUDO-REPORTERS exist in the reference list: `S19` "Other Asia, nes" is
    not a country and carries a non-ISO alpha-3. It is dropped at conform and counted.
  - ZERO vs MISSING: a reporter that did not report simply has no row. `primaryValue` is
    never null on a row that exists. Absent stays absent - it is never written as 0.
  - `isReported` is FALSE on many chapter rows: Comtrade derived the chapter total by
    summing the country's HS-6 lines rather than the country publishing chapter 88
    directly. That is normal and not an estimate of missing data, but it travels through
    to the published file so the UI can say which figures are sums.
  - UNITS ARE PLAIN USD. WITS delivers thousands of USD and `build.py` multiplies by
    1000 exactly once. Comtrade does NOT - `primaryValue` for USA 2023 exports is
    2018500000000.0. Do not reuse the WITS scaling here.
  - Imports carry `cifvalue`, exports `fobvalue`. The usual asymmetry; `primaryValue` is
    the one to read and is already the right side of it.

RATE LIMITS AND TERMS (checked before writing a line of this, per CLAUDE.md):

  - The public preview endpoint needs no key. It caps at 500 RECORDS PER CALL and rate
    limits hard - roughly eight rapid calls earn an HTTP 429. Backoff below is therefore
    not optional, and batching is what makes the whole fetch affordable: 80 reporters in
    one call returns ~90 rows, so all 255 reporters cost four calls per year and flow
    pair rather than 510.
  - THE 500-RECORD CAP IS THE DANGEROUS PART. A truncated response is a silently wrong
    aggregate, so every batch is checked against the cap at parse time and the build
    refuses the vintage if any response came back at exactly 500 rows.
  - Dimensions are PINNED (`partner2Code`, `motCode`, `customsCode`). Without them a
    multi-reporter query returns rows split across mode-of-transport and customs-procedure
    dimensions - ten reporters came back as 67 rows - and summing or truncating those is
    how you get a confidently wrong number.
  - Licence: UN Comtrade permits re-dissemination of TRANSFORMED data (their word for
    aggregations and derived indicators) with no fee, and states that a data-visualisation
    system may present actual figures. The fee applies to re-disseminating original
    records in bulk - API streaming, file downloads - which this project does not do.
    See docs and the note published on /source.

Run:  python -m data.etl.connectors.comtrade --vintage 2026-08-26
"""

from __future__ import annotations

import argparse
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "raw" / "comtrade"

PREVIEW = "https://comtradeapi.un.org/public/v1/preview/C/A/HS"
REPORTERS_REF = "https://comtradeapi.un.org/files/v1/app/reference/Reporters.json"

LICENSE = "UN Comtrade - transformed/derived re-dissemination permitted; see /source"

# Pinned so a row is one reporter, one year, one flow, one commodity. See the docstring:
# without these the response fans out across transport-mode and customs-procedure
# dimensions and the 500-row cap starts silently truncating real aggregates.
PINNED = {
    "partnerCode": "0",      # World
    "partner2Code": "0",
    "motCode": "0",          # all modes of transport
    "customsCode": "C00",    # all customs procedures
}

# 80 keeps a response near 90 rows - an order of magnitude under the 500 cap, so a batch
# can never be truncated - while keeping the URL short enough to be uncontroversial.
BATCH = 80

#: The hard ceiling the preview endpoint applies. A response of exactly this length is
#: assumed truncated and fails the build rather than publishing a short aggregate.
RECORD_CAP = 500

TIMEOUT = 90
MAX_RETRIES = 6
#: Deliberately slow. The endpoint 429s after a handful of rapid calls and the whole job
#: is only a few dozen requests, so there is nothing to gain by pushing it.
PACE_SECONDS = 6.0

# ---------------------------------------------------------------- what to fetch

#: Years past the WITS frontier. 2025 is expected to be PARTIAL - countries file
#: progressively through the following year - and the build labels it as such rather than
#: presenting a half-reported year beside complete ones.
FRONTIER_YEARS = [2024, 2025]

#: Aircraft. 2023 is fetched as well as 2024 even though WITS covers 2023, because a
#: chapter figure needs a year that overlaps the existing build to be checkable against
#: it - without the overlap year there is no way to show that this source and WITS agree.
AVIATION_CMD = "88"
AVIATION_YEARS = [2023, 2024]


def _url(reporters: str, year: int, cmd: str, flows: str = "X,M") -> str:
    params = {
        "reporterCode": reporters,
        "period": str(year),
        "cmdCode": cmd,
        "flowCode": flows,
        **PINNED,
    }
    return f"{PREVIEW}?{urllib.parse.urlencode(params)}"


def fetch(url: str) -> dict | None:
    """One request, with backoff that escalates on 429.

    Returns None for a 404 - a year or reporter the source simply does not carry, which
    is data ("nobody filed") rather than a failure.
    """
    last: Exception | None = None
    for attempt in range(MAX_RETRIES):
        try:
            req = urllib.request.Request(
                url, headers={"User-Agent": "TradeCenter-ETL/0.1 (+contact via repo)"}
            )
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as exc:
            last = exc
            if exc.code == 404:
                return None
            if exc.code == 429:
                # Escalating, not fixed: the limiter widens its window the harder it is
                # hit, so a constant retry interval just keeps earning 429s.
                wait = 20 * (attempt + 1)
                print(f"    429, backing off {wait}s")
                time.sleep(wait)
                continue
            if exc.code >= 500:
                time.sleep(5 * (attempt + 1))
                continue
            raise
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as exc:
            last = exc
            time.sleep(5 * (attempt + 1))
    raise RuntimeError(f"failed after {MAX_RETRIES} attempts: {url}") from last


def reporter_codes(out_dir: Path) -> list[int]:
    """The M49 codes to ask for, and the reference that maps them to ISO3.

    Stored in the raw drop rather than resolved and thrown away: the ISO mapping is source
    data, it changes over time, and a published figure has to stay re-derivable from raw
    alone.
    """
    path = out_dir / "_reporters.json"
    if not path.exists():
        payload = fetch(REPORTERS_REF)
        path.write_text(json.dumps(payload), encoding="utf-8")
        time.sleep(PACE_SECONDS)
    payload = json.loads(path.read_text(encoding="utf-8"))
    rows = payload.get("results", payload if isinstance(payload, list) else [])
    codes = []
    for row in rows:
        code = row.get("reporterCode")
        if isinstance(code, int) and code > 0:
            codes.append(code)
    return sorted(set(codes))


def jobs(codes: list[int]) -> list[tuple[str, str]]:
    """(filename, url) pairs. Filenames encode job, year and batch so the drop is
    resumable per batch rather than all-or-nothing."""
    out: list[tuple[str, str]] = []
    batches = [codes[i : i + BATCH] for i in range(0, len(codes), BATCH)]
    for year in FRONTIER_YEARS:
        for i, batch in enumerate(batches):
            reporters = ",".join(str(c) for c in batch)
            out.append((f"frontier_{year}_b{i:02d}.json", _url(reporters, year, "TOTAL")))
    for year in AVIATION_YEARS:
        for i, batch in enumerate(batches):
            reporters = ",".join(str(c) for c in batch)
            out.append((f"aviation_{year}_b{i:02d}.json", _url(reporters, year, AVIATION_CMD)))
    return out


def run(vintage: str) -> None:
    out_dir = RAW / vintage
    out_dir.mkdir(parents=True, exist_ok=True)

    codes = reporter_codes(out_dir)
    todo = jobs(codes)
    print(f"[comtrade] {len(codes)} reporters, {len(todo)} requests -> {out_dir}")

    fetched = skipped = empty = 0
    for name, url in todo:
        target = out_dir / name
        # Resumable: an interrupted run is rerun, not restarted. Same contract as the
        # WITS fetcher - and the same trap, so it is repeated here: filenames encode the
        # YEAR but not the endpoint's own frontier, so changing FRONTIER_YEARS means a
        # NEW vintage directory, never a rerun into an existing one.
        if target.exists():
            skipped += 1
            continue
        payload = fetch(url)
        if payload is None:
            target.write_text(json.dumps({"_no_data": True, "_url": url}), encoding="utf-8")
            empty += 1
        else:
            payload["_url"] = url
            target.write_text(json.dumps(payload), encoding="utf-8")
            fetched += 1
            n = payload.get("count", 0)
            flag = "  <-- AT CAP, may be truncated" if n >= RECORD_CAP else ""
            print(f"  {name}  rows={n}{flag}")
        time.sleep(PACE_SECONDS)

    (out_dir / "_meta.json").write_text(
        json.dumps(
            {
                "source": "UN Comtrade",
                "endpoint": PREVIEW,
                "reporters_reference": REPORTERS_REF,
                "retrieved_at": datetime.now(timezone.utc).isoformat(),
                "vintage": vintage,
                "license": LICENSE,
                "parameters": {
                    "pinned": PINNED,
                    "batch_size": BATCH,
                    "record_cap": RECORD_CAP,
                    "frontier_years": FRONTIER_YEARS,
                    "aviation_years": AVIATION_YEARS,
                    "aviation_cmd": AVIATION_CMD,
                    "classification": "HS (H6 as returned)",
                },
                "units": "primaryValue is USD, NOT thousands - unlike WITS",
                "counts": {"fetched": fetched, "skipped": skipped, "no_data": empty},
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"[comtrade] fetched={fetched} skipped={skipped} no_data={empty}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--vintage", required=True)
    run(ap.parse_args().vintage)


if __name__ == "__main__":
    main()
