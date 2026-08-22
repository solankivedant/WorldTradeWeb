/**
 * Merging exports and imports into comparable pairs.
 *
 * These live in `lib/` rather than beside the chart components on purpose: server
 * components build the pairs and pass them down, and anything exported from a
 * `"use client"` module cannot be called from the server at all. Keeping the pure data
 * shaping here lets both sides use it.
 *
 * Every pairing ranks by TOTAL trade, never by one side. Ranking by exports silently
 * reorders the list depending on which direction you happen to be looking at, which is
 * exactly the split-view problem these pairs exist to remove.
 */

import type { ProductRow } from "./types";

export interface SectorPair {
  code: string;
  name: string;
  exports: number | null;
  imports: number | null;
  net: number | null;
}

export interface PartnerPair {
  iso3: string;
  name: string;
  iso2: string | null;
  exports: number | null;
  imports: number | null;
  net: number | null;
}

const byTotalDesc = <T extends { exports: number | null; imports: number | null }>(a: T, b: T) =>
  (b.exports ?? 0) + (b.imports ?? 0) - ((a.exports ?? 0) + (a.imports ?? 0));

/** Net is null unless BOTH sides are reported - half a comparison is not a comparison. */
const withNet = <T extends { exports: number | null; imports: number | null }>(row: T) => ({
  ...row,
  net: row.exports !== null && row.imports !== null ? row.exports - row.imports : null,
});

export function pairSectors(exportRows: ProductRow[], importRows: ProductRow[]): SectorPair[] {
  const byCode = new Map<string, Omit<SectorPair, "net">>();

  for (const row of exportRows) {
    byCode.set(row.code, { code: row.code, name: row.name, exports: row.value, imports: null });
  }
  for (const row of importRows) {
    const existing = byCode.get(row.code);
    if (existing) existing.imports = row.value;
    else byCode.set(row.code, { code: row.code, name: row.name, exports: null, imports: row.value });
  }

  return [...byCode.values()].map(withNet).sort(byTotalDesc);
}

export interface PartnerInput {
  iso3: string;
  name: string;
  iso2: string | null;
  value: number;
}

export function pairPartners(
  exportRows: PartnerInput[],
  importRows: PartnerInput[],
): PartnerPair[] {
  const byIso = new Map<string, Omit<PartnerPair, "net">>();

  for (const row of exportRows) {
    byIso.set(row.iso3, {
      iso3: row.iso3,
      name: row.name,
      iso2: row.iso2,
      exports: row.value,
      imports: null,
    });
  }
  for (const row of importRows) {
    const existing = byIso.get(row.iso3);
    if (existing) existing.imports = row.value;
    else
      byIso.set(row.iso3, {
        iso3: row.iso3,
        name: row.name,
        iso2: row.iso2,
        exports: null,
        imports: row.value,
      });
  }

  return [...byIso.values()].map(withNet).sort(byTotalDesc);
}

/**
 * One shared scale across every row AND both sides.
 *
 * Scaling each row to its own maximum would make a $2B row look the same as a $200B one,
 * which defeats the comparison the bars exist for.
 */
export function pairScale(
  rows: { exports: number | null; imports: number | null }[],
): number {
  return Math.max(...rows.map((r) => Math.max(r.exports ?? 0, r.imports ?? 0)), 1);
}
