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

// ------------------------------------------------------- what a country trades most

/**
 * The single largest sector group on one side of a country's trade.
 *
 * `share` is that group's percentage of the SAME cube it came from - the product cube
 * summed over its sixteen groups - never of `totals.json`. Those are two separate WITS
 * aggregations and for a handful of countries (DOM, GUY) they disagree by 3-11%, so
 * dividing a cube figure by a totals figure would produce a share that is quietly wrong
 * and, for the worst cases, could exceed 100%. Denominator and numerator must come from
 * one aggregation (see CLAUDE.md, "Trade is measured at three grains").
 */
export interface LeadingSector {
  code: string;
  name: string;
  value: number;
  /** Percent of this direction's product cube. */
  share: number;
  /** Groups summed to reach that denominator, so the reader can see the base. */
  ofGroups: number;
}

function leading(rows: ProductRow[]): LeadingSector | null {
  if (!rows.length) return null;
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  // A reported zero is a real datum, but it cannot be a "largest" - and dividing by a
  // zero total would produce Infinity rather than an absent answer.
  if (total <= 0) return null;
  const top = rows.reduce((best, row) => (row.value > best.value ? row : best), rows[0]);
  if (top.value <= 0) return null;
  return {
    code: top.code,
    name: top.name,
    value: top.value,
    share: (top.value / total) * 100,
    ofGroups: rows.length,
  };
}

/**
 * What a country sells most, and what it buys most.
 *
 * Returned as a PAIR and never singly, for the same reason nothing else in this app
 * shows one direction alone: "Fuels" as a country's biggest export reads as an economy
 * built on oil until you see fuels are also its biggest import, at which point it reads
 * as a refiner. Both sides or neither.
 *
 * Each side is ranked within its own direction - unlike `pairSectors`, which ranks by the
 * two combined. That difference is the point: this answers "what does it sell most",
 * which is a question about one side, and the pairing rule exists so the answer is never
 * PRESENTED alone, not to stop it being computed.
 */
export function leadingSectors(
  exportRows: ProductRow[],
  importRows: ProductRow[],
): { exports: LeadingSector | null; imports: LeadingSector | null } {
  return { exports: leading(exportRows), imports: leading(importRows) };
}
