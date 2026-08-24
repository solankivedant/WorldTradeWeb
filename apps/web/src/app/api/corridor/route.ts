import { NextRequest, NextResponse } from "next/server";
import {
  bilateralValue,
  corridorSectors,
  dataset,
  getCountry,
  hasSectorDetail,
  latestYear,
  provenance,
  tariffApplied,
  totalsFor,
} from "@/lib/data";
import { leadingSectors } from "@/lib/pairing";

export const dynamic = "force-dynamic";

/** Sector rows the panel draws before folding the tail into "Other". */
const SECTOR_ROWS = 8;

/**
 * One corridor, for the map's connection panel.
 *
 * Separate from the `/corridor/[a]/[b]` page rather than reusing it, because the panel
 * opens on a click over the map and has to arrive in one round trip without a navigation
 * - the reader's viewport, selection and zoom all have to survive.
 *
 * Each direction is read from the SELLER's own report, matching how the arcs themselves
 * are built, falling back to the buyer's books only where the seller publishes nothing at
 * all. The other side's mirror of the same trade travels alongside so the panel can show
 * the gap; it is never averaged in.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const a = (params.get("a") ?? "").toUpperCase();
  const b = (params.get("b") ?? "").toUpperCase();
  const year = Number(params.get("year")) || latestYear();
  const sector = params.get("sector") ?? "";

  const ca = getCountry(a);
  const cb = getCountry(b);
  if (!ca || !cb || ca.iso3 === cb.iso3) {
    return NextResponse.json({ error: "unknown corridor" }, { status: 400 });
  }

  /**
   * Both directions, preferring the SELLER's own books.
   *
   * Around thirty economies file no export report at all - Russia is one, and it is
   * India's largest fuel supplier. Reading only the seller's books leaves their whole
   * direction blank, which renders as "-" and reads as "no trade" when the buyer has in
   * fact published a figure for exactly those goods. So when the seller reports nothing,
   * fall back to the buyer's customs record and say which side the number came from.
   *
   * The fallback is keyed on the seller being a non-reporter, never on the value simply
   * being missing: a reporting country that omits one corridor is making a statement
   * about that corridor, and substituting the other side's number would overwrite it.
   */
  const { nonReporters } = dataset();
  const sellerSilent = { a: nonReporters.has(a), b: nonReporters.has(b) };

  const aToBMirror = bilateralValue(b, a, "m"); // B's reported imports from A
  const bToAMirror = bilateralValue(a, b, "m"); // A's reported imports from B

  const aToB = sellerSilent.a ? aToBMirror : bilateralValue(a, b, "x");
  const bToA = sellerSilent.b ? bToAMirror : bilateralValue(b, a, "x");

  // Only meaningful when the two figures are genuinely two independent measurements. If
  // A does not report, `aToB` IS the mirror and comparing it with itself yields 0%, which
  // would claim perfect agreement where there is only one source.
  const mirrorGapPct =
    !sellerSilent.a && aToB !== null && aToBMirror !== null && aToB > 0
      ? ((aToBMirror - aToB) / aToB) * 100
      : null;

  /**
   * Sector split, paired so both directions of a sector sit on one row.
   *
   * Ranked by the two added together, never by one side: ranking by exports alone
   * reorders the list depending on which direction the reader happens to be looking at,
   * which is the split-view problem in another form.
   *
   * Sourced by the same rule as the headline figures above, so the split and the headline
   * can never disagree about which country's books they came from.
   */
  const outbound = sellerSilent.a ? corridorSectors(b, a, "m") : corridorSectors(a, b, "x");
  const inbound = sellerSilent.b ? corridorSectors(a, b, "m") : corridorSectors(b, a, "x");
  const bySector = new Map<
    string,
    { code: string; name: string; aToB: number | null; bToA: number | null }
  >();
  for (const row of outbound) {
    bySector.set(row.code, { code: row.code, name: row.name, aToB: row.value, bToA: null });
  }
  for (const row of inbound) {
    const existing = bySector.get(row.code);
    if (existing) existing.bToA = row.value;
    else bySector.set(row.code, { code: row.code, name: row.name, aToB: null, bToA: row.value });
  }

  const ranked = [...bySector.values()].sort(
    (x, y) => (y.aToB ?? 0) + (y.bToA ?? 0) - ((x.aToB ?? 0) + (x.bToA ?? 0)),
  );
  const shown = ranked.slice(0, SECTOR_ROWS);
  const tail = ranked.slice(SECTOR_ROWS);
  // The tail is summed rather than dropped, so the bars still account for the whole
  // corridor and a reader can see how much sits outside the named rows.
  const other =
    tail.length > 0
      ? {
          count: tail.length,
          aToB: tail.reduce((sum, r) => sum + (r.aToB ?? 0), 0),
          bToA: tail.reduce((sum, r) => sum + (r.bToA ?? 0), 0),
        }
      : null;

  const sectors = shown.map((row) => ({
    ...row,
    net: row.aToB !== null && row.bToA !== null ? row.aToB - row.bToA : null,
  }));

  /**
   * The single largest group each way, from the SAME sourced rows the bars use.
   *
   * Computed from `outbound`/`inbound` rather than from `shown`: that list is the top six
   * by combined trade and is truncated, so the largest one-way flow can sit outside it.
   */
  const leading = leadingSectors(outbound, inbound);

  const aTotals = totalsFor(a, year);
  const bTotals = totalsFor(b, year);

  return NextResponse.json(
    {
      data: {
        year,
        a: { iso3: ca.iso3, iso2: ca.iso2, name: ca.name },
        b: { iso3: cb.iso3, iso2: cb.iso2, name: cb.name },
        aToB,
        bToA,
        aToBMirror,
        bToAMirror,
        mirrorGapPct,
        balanceForA: aToB !== null && bToA !== null ? aToB - bToA : null,
        // What this corridor is worth to each side's own trade. A $16B corridor means
        // something different to a $431B exporter than to a $40B one.
        aShareOfAExports:
          aToB !== null && aTotals.x ? (aToB / aTotals.x) * 100 : null,
        bShareOfBExports:
          bToA !== null && bTotals.x ? (bToA / bTotals.x) * 100 : null,
        tariffBOnA: tariffApplied(b, a),
        tariffAOnB: tariffApplied(a, b),
        sectors,
        topAToB: leading.exports,
        topBToA: leading.imports,
        other,
        hasSectorDetail: hasSectorDetail(),
        /** Which sides came from the buyer's books because the seller publishes nothing. */
        buyerSourced: {
          aToB: sellerSilent.a,
          bToA: sellerSilent.b,
        },
        /** Highlighted when the map's sector lens is on, so the panel matches the arcs. */
        focusSector: sector || null,
      },
      meta: provenance(),
    },
    { headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" } },
  );
}
