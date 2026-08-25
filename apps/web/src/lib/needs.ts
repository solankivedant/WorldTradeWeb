import { getCountry, productsFor, sectorPartners, tariffApplied } from "./data";
import { sectorInfo } from "./sectors";
import type { FigureSource } from "./types";

/**
 * What a country leans on the rest of the world for.
 *
 * This is the demand-side mirror of `opportunity.ts`. That file asks "where could this
 * country sell more"; this one asks "what does this country buy far more of than it
 * makes, and who currently fills the gap".
 *
 * ---------------------------------------------------------------------------
 * THE ONE THING THIS CANNOT SEE: DOMESTIC PRODUCTION.
 *
 * There is no output, capacity or consumption series in this build - customs data
 * records what crosses a border and nothing else. So "needs" here means NET RELIANCE ON
 * FOREIGN SUPPLY, never unmet demand in any absolute sense. The United States both makes
 * and buys enormous quantities of machinery; a large net import gap says it buys more
 * than it sells, not that it cannot make any. Every figure this module returns has to be
 * read that way, and the page renders that sentence above the numbers rather than in a
 * footnote below them.
 *
 * A production series would change the question from "net reliance" to "import
 * dependence of consumption", which is a genuinely different and better metric. It needs
 * a source this build does not carry (UN Industrial Statistics or national accounts), so
 * it is not approximated here - an approximated denominator would make every ratio on the
 * page confidently wrong.
 * ---------------------------------------------------------------------------
 *
 * Grain is the HS SECTION GROUP, all sixteen of them, latest year only. There is no
 * per-product figure anywhere in this build and none is synthesised here; see
 * `groupContents` at the foot of this file for what can honestly be said about what sits
 * inside a group.
 */

export interface SectorBalance {
  code: string;
  name: string;
  /** Sold to the world in this group. Null means not reported, never zero. */
  exports: number | null;
  /** Bought from the world in this group. Null means not reported, never zero. */
  imports: number | null;
  /**
   * imports - exports. Positive: it buys more of this than it sells.
   *
   * Null unless BOTH sides are reported. Half a comparison is not a comparison - the same
   * rule `pairSectors` applies to `net`, for the same reason: subtracting an absent
   * figure from a present one silently treats "not reported" as zero.
   */
  gap: number | null;
  /**
   * exports / imports, as a percentage. 100 means it sells as much of this group as it
   * buys; 5 means it sells a twentieth of what it buys.
   *
   * The export-import coverage ratio is a standard trade statistic and it is the single
   * clearest reading on this page, because unlike the gap it does not simply rank big
   * economies and big sectors first. Null when imports are absent or zero - there is
   * nothing to cover.
   */
  coverage: number | null;
  /**
   * This group's share of the country's whole import bill, percent.
   *
   * Denominator is the sum of the SIXTEEN GROUPS, not `totals.json`. Those are two
   * separate WITS aggregations that disagree by 3-11% for a handful of countries, so
   * mixing them would produce a share that is quietly wrong and, at worst, over 100%.
   * Numerator and denominator come from one aggregation (CLAUDE.md, "Trade is measured at
   * three grains").
   */
  importShare: number | null;
  /**
   * The coverage ratio said in words, resolved HERE rather than in the component.
   *
   * The list that renders these is a client component, and this module reaches into
   * `lib/data.ts`. A client component importing a band helper from here would drag the
   * whole in-memory dataset into the browser bundle, so the only thing it may import
   * from this file is `import type` - which the compiler erases. Anything a row needs to
   * SAY travels on the row.
   */
  band: { label: string; blurb: string } | null;
}

export interface Supplier {
  iso: string;
  name: string;
  iso2: string | null;
  value: number;
  /** Whose books this came from. `importer` means the seller publishes nothing at all. */
  src: FigureSource;
  /** What the buying country charges this partner, averaged across all products. */
  tariff: number | null;
}

export interface SupplyPicture {
  /** Ranked, largest first. Trimmed for display; `supplierCount` is the true total. */
  suppliers: Supplier[];
  supplierCount: number;
  /**
   * Herfindahl-Hirschman index over every reported supplier's share of this country's
   * inbound trade in the group, 0-10,000. High means a few countries carry the gap.
   *
   * Computed over ALL suppliers, not the displayed slice - an HHI over a truncated list
   * is arithmetically meaningless. Null when nobody is reported.
   */
  hhi: number | null;
  /** The largest single supplier's share of the group, percent. */
  topShare: number | null;
}

/** How thin a coverage ratio has to be before the page calls it out in words. */
const COVERAGE_BANDS = [
  { max: 10, label: "Almost entirely bought in", blurb: "sells under a tenth of what it buys" },
  { max: 50, label: "Mostly bought in", blurb: "sells well under half of what it buys" },
  { max: 90, label: "Leans on imports", blurb: "sells less than it buys" },
  { max: 110, label: "Roughly balanced", blurb: "sells about as much as it buys" },
  { max: Infinity, label: "Net supplier", blurb: "sells more than it buys" },
] as const;

function coverageBand(coverage: number | null): { label: string; blurb: string } | null {
  if (coverage === null) return null;
  const hit = COVERAGE_BANDS.find((band) => coverage < band.max) ?? COVERAGE_BANDS[COVERAGE_BANDS.length - 1];
  return { label: hit.label, blurb: hit.blurb };
}

/**
 * Every sector group for one country, with both sides and the derived readings.
 *
 * Returned unsorted-by-nothing-in-particular: the caller chooses the ranking, because
 * "biggest dollar gap" and "thinnest coverage" are different questions and this page
 * offers both. Groups the country reports on NEITHER side are dropped - a row of two
 * dashes is not information - but a group reported on only one side is kept, with the
 * absent side null and the derived figures null with it.
 */
export function sectorBalances(iso3: string): SectorBalance[] {
  const exportRows = productsFor(iso3, "x");
  const importRows = productsFor(iso3, "m");

  const byCode = new Map<string, { code: string; name: string; exports: number | null; imports: number | null }>();
  for (const row of exportRows) {
    byCode.set(row.code, { code: row.code, name: row.name, exports: row.value, imports: null });
  }
  for (const row of importRows) {
    const existing = byCode.get(row.code);
    if (existing) existing.imports = row.value;
    else byCode.set(row.code, { code: row.code, name: row.name, exports: null, imports: row.value });
  }

  // The import bill, summed from the SAME cube these rows came from.
  const importBill = importRows.reduce((sum, row) => sum + row.value, 0);

  return [...byCode.values()].map((row) => {
    const coverage =
      row.imports !== null && row.imports > 0 && row.exports !== null
        ? (row.exports / row.imports) * 100
        : null;
    return {
      ...row,
      gap: row.exports !== null && row.imports !== null ? row.imports - row.exports : null,
      coverage,
      importShare: row.imports !== null && importBill > 0 ? (row.imports / importBill) * 100 : null,
      band: coverageBand(coverage),
    };
  });
}

export type NeedsSort = "gap" | "coverage" | "share";

/**
 * Rank the balances for one side of the question.
 *
 * `needs` keeps groups the country is a net BUYER of; `supplies` keeps the ones it is a
 * net seller of. Both sides ship because showing only the deficits would be the
 * split-view mistake this app refuses everywhere else - a country's needs mean something
 * different once you can see what it pays for them with.
 */
export function rankBalances(
  rows: SectorBalance[],
  lens: "needs" | "supplies",
  sort: NeedsSort,
): SectorBalance[] {
  const side = rows.filter((row) => {
    if (row.gap === null) return false;
    return lens === "needs" ? row.gap > 0 : row.gap < 0;
  });

  const magnitude = (row: SectorBalance) => Math.abs(row.gap ?? 0);

  return side.sort((a, b) => {
    if (sort === "share") return (b.importShare ?? 0) - (a.importShare ?? 0);
    if (sort === "coverage") {
      // Thinnest coverage first on the needs side, thickest first on the supplies side -
      // in both cases "most extreme example of this lens" leads.
      const av = a.coverage ?? (lens === "needs" ? Infinity : -Infinity);
      const bv = b.coverage ?? (lens === "needs" ? Infinity : -Infinity);
      return lens === "needs" ? av - bv : bv - av;
    }
    return magnitude(b) - magnitude(a);
  });
}

/**
 * Who actually supplies one group to one country, and how concentrated that is.
 *
 * Inbound comes from each PARTNER's own export report, falling back to this country's
 * import book only for partners that publish nothing at all - the convention the map
 * flows and the corridor lists already use, and the reason Russia appears in fuel supply
 * lists rather than silently missing from them. `src` carries which applies per row.
 *
 * The tariff travelling with each supplier is what the buying country charges THAT
 * partner, averaged across all products. It is not group-specific: no per-sector rate is
 * published at this tier, and pretending otherwise would put a precise-looking number
 * against the wrong goods.
 */
export function supplyPicture(iso3: string, sector: string, limit = 8): SupplyPicture {
  // A limit high enough to be every partner on earth: the HHI below has to see the whole
  // distribution, and an index over a truncated list is arithmetically meaningless.
  const { imports: all, importCount } = sectorPartners(iso3, sector, 10_000);

  const total = all.reduce((sum, row) => sum + row.v, 0);
  const hhi = total > 0 ? all.reduce((sum, row) => sum + ((row.v / total) * 100) ** 2, 0) : null;

  const suppliers: Supplier[] = all.slice(0, limit).map((row) => {
    const country = getCountry(row.iso);
    return {
      iso: row.iso,
      name: country?.name ?? row.iso,
      iso2: country?.iso2 ?? null,
      value: row.v,
      src: row.src,
      tariff: tariffApplied(iso3, row.iso),
    };
  });

  return {
    suppliers,
    supplierCount: importCount,
    hhi,
    topShare: total > 0 && all.length ? (all[0].v / total) * 100 : null,
  };
}

/**
 * What sits inside a section group, as HS NOMENCLATURE.
 *
 * This is the honest limit of "individual products" in this build. `covers` names example
 * chapters of the Harmonized System and carries no figures whatsoever - it is not a
 * ranked product list and must never be rendered as though a value attached to any item
 * in it. Per-product figures need HS-6 detail from UN Comtrade, which is a V2 data
 * decision (docs/PRD.md §10), and the section-group tier was chosen precisely because it
 * is stable across HS revisions H0-H6.
 */
export function groupContents(code: string): { hs: string; covers: string[] } | null {
  const info = sectorInfo(code);
  if (!info) return null;
  return {
    hs: info.hs,
    covers: info.covers.split(",").map((item) => item.trim()).filter(Boolean),
  };
}
