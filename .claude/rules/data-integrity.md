# Rule: Data integrity

The product's only real asset is trust in its numbers. These rules are not style preferences.

## Never fabricate trade figures

Do not invent plausible-looking trade values, tariff rates, or country statistics — not in
seed data, not in tests, not in demos, not in a comment showing example output. A fabricated
number in a fixture eventually gets screenshotted as real.

When example data is needed:
- Use clearly synthetic country codes (`XXA`, `XXB`) and round unmistakable values (`1000`,
  `2000`), or
- Use real data pulled through the ETL and record its source and vintage in the fixture header.

## Every figure carries provenance

Any API response, table, or chart that displays a number must be able to answer: which
source, which vintage, retrieved when. The `meta` block on API responses exists for this.
Do not drop it to simplify a payload.

## Zero and unknown are different

`0` means "reported as zero trade." `null` means "not reported." They must never be
coalesced, share a color on the map, or render identically in a table. Coalescing them
silently invents data.

## HS revisions are load-bearing

Any query spanning multiple years must either pin a single HS revision or route through
`hs_concordance`. Doing neither produces confidently wrong trends. If a function accepts a
year range and an HS code, the revision handling must be explicit in its signature or its
docstring.

## Mirror flows disagree, and that is data

Country A's reported exports to B routinely differ from B's reported imports from A. Do not
average them, pick one silently, or hide the gap. Surface both with the discrepancy flagged.

## Validate at every ETL stage

Every pipeline stage asserts its output schema with Pandera before writing. A stage that
writes unvalidated data to `data/processed/` is incomplete. Range checks matter as much as
type checks — a negative trade value or a 400% tariff is a bug upstream, not a datum.

## Raw data is immutable

`data/raw/` is append-only. Never edit or clean a file in place there. Any published figure
must be re-derivable from raw by rerunning the pipeline.
