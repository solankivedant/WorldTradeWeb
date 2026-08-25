/**
 * Server-side data access over the published ETL output.
 *
 * V1 loads the published JSON into memory once per process. The whole dataset is a
 * few tens of MB and entirely read-only, so this is both correct and faster than any
 * database round-trip. When the cube grows past what fits comfortably in memory -
 * or when HS-6 detail lands - this module is the seam where DuckDB goes in behind the
 * same function signatures (see docs/TECH_STACK.md §4).
 *
 * Server-only. Importing this from a client component is a bug.
 */

import "server-only";
import fs from "node:fs";
import path from "node:path";
import { SECTOR_CATALOG } from "./sectors";
import type {
  BilateralRow,
  Country,
  CorridorRow,
  CorridorSectorRow,
  FigureSource,
  IndicatorFamily,
  IndicatorFile,
  IndicatorReading,
  IndicatorSpec,
  ProductRow,
  Provenance,
  SectorOverview,
  YearTotals,
} from "./types";

/**
 * Published shape of `bilateral_sectors.json`.
 *
 * Index-encoded on purpose: the sector code would otherwise repeat a few hundred
 * thousand times and roughly triple the file. `codes` ships inside the same file rather
 * than being implied by `SECTOR_CATALOG`, so a drift between the two cannot silently
 * relabel every figure - resolve indexes against THIS array, never against the catalogue.
 */
interface BilateralSectorsFile {
  codes: string[];
  /** reporter -> flow -> partner -> [sectorIndex, USD][] */
  flows: Record<string, Partial<Record<"x" | "m", Record<string, [number, number][]>>>>;
}

/** Display names for the published sector codes. Static, so safe to resolve here. */
const SECTOR_NAMES: Record<string, string> = Object.fromEntries(
  SECTOR_CATALOG.map((s) => [s.code, s.name]),
);

/**
 * Published shape of `mirror.json` - figures REBUILT from partner reports for economies
 * that file nothing themselves.
 *
 * A separate file from `totals.json` and `products.json` on purpose. These are derived,
 * not measured, and keeping them in their own store means no caller can pick one up while
 * believing it holds a reported figure: it has to ask for a mirror figure by name.
 */
interface MirrorFile {
  codes: string[];
  method: string;
  year: number;
  countries: Record<
    string,
    {
      exports: number | null;
      imports: number | null;
      /** How many partners contributed. The honest weight of the estimate. */
      exportPartners: number;
      importPartners: number;
      sectors: { x: [number, number][]; m: [number, number][] };
    }
  >;
}

interface Meta {
  vintage: string;
  built_at: string;
  latest_year: number;
  /**
   * The year the TARIFF rows carry, read from the tariff data at build time.
   *
   * Separate from `latest_year` because trade flows and applied rates are separate WITS
   * datasets on separate release cycles. They sit at the same year today; the field
   * exists so the day they diverge is a visible fact rather than a silent mislabelling.
   * Null for a build predating the split.
   */
  tariff_year: number | null;
  sources: { name: string; url: string; license: string }[];
  units: Record<string, string>;
  caveats: string[];
  stats: Record<string, unknown>;
}

/**
 * Where the published dataset lives, resolved rather than assumed.
 *
 * `process.cwd()` is not the same place in every environment this runs in: it is the app
 * directory under `pnpm dev` and in a Vercel build, but a serverless bundle can be rooted
 * elsewhere depending on how the host lays the files out. A single hard-coded
 * `../../data/processed` therefore worked locally and resolved to nothing in production -
 * and because the reader below swallowed the ENOENT, the deploy came up green with every
 * figure on the site missing.
 *
 * So: try the plausible roots, take the first that actually contains the dataset, and say
 * so loudly when none of them do. `next.config.mjs` is what guarantees the files are
 * bundled into the function in the first place (`outputFileTracingIncludes`) - this
 * function only finds them once they are there.
 */
const DATA_CANDIDATES = [
  // monorepo dev, and Vercel builds rooted at apps/web
  path.resolve(process.cwd(), "../../data/processed"),
  // a bundle rooted at the repo root
  path.resolve(process.cwd(), "data/processed"),
  // a bundle that kept the workspace nesting but is rooted one level higher
  path.resolve(process.cwd(), "../data/processed"),
];

function resolveDataDir(): string | null {
  for (const dir of DATA_CANDIDATES) {
    // meta.json is the marker: it is written last by the publish stage, so its presence
    // means a complete build rather than a half-populated directory.
    if (fs.existsSync(path.join(dir, "meta.json"))) return dir;
  }
  return null;
}

const DATA_DIR = resolveDataDir();

if (!DATA_DIR) {
  // Not a throw: an unbuilt checkout is a legitimate local state, and the UI has an empty
  // state that tells you which pipelines to run. But it must never be SILENT again.
  console.error(
    [
      "[data] published dataset not found. Looked in:",
      ...DATA_CANDIDATES.map((dir) => `  ${dir}`),
      `  cwd=${process.cwd()}`,
      "Run the ETL, and check data/processed/*.json is committed - it is what ships to production.",
    ].join("\n"),
  );
}

function read<T>(file: string, fallback: T): T {
  if (!DATA_DIR) return fallback;
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf-8")) as T;
  } catch (error) {
    console.error(`[data] failed to read ${file} from ${DATA_DIR}:`, error);
    return fallback;
  }
}

/** The resolved dataset directory, for the one caller that reads a file directly. */
export function dataDir(): string | null {
  return DATA_DIR;
}

interface Dataset {
  countries: Country[];
  byIso: Map<string, Country>;
  totals: Record<string, Record<string, YearTotals>>;
  bilateral: BilateralRow[];
  products: Record<string, { x?: ProductRow[]; m?: ProductRow[] }>;
  tariffs: Record<string, Record<string, number>>;
  context: Record<string, { gdp: Record<string, number>; population: Record<string, number> }>;
  /**
   * The context layer: services, investment, logistics, governance, prices.
   *
   * Its own file and its own field, never merged into `context` or `totals`. None of it
   * is customs data, so a caller has to ask for it by name - the same rule mirror
   * estimates live under, and for the same reason.
   */
  indicators: IndicatorFile;
  meta: Meta;
  /** exports keyed `${reporter}|${partner}` for O(1) corridor lookup */
  exportIndex: Map<string, number>;
  importIndex: Map<string, number>;
  exportsByReporter: Map<string, BilateralRow[]>;
  importsByReporter: Map<string, BilateralRow[]>;
  sectors: BilateralSectorsFile;
  mirror: MirrorFile;
  /**
   * Who ships a given sector INTO a country, keyed `${destination}|${sectorIndex}`.
   *
   * The forward direction is already a two-key lookup in `sectors.flows`, but "who sells
   * fuels to India" is a scan of every reporter without this. Built once at startup
   * because the map asks it on every sector-filtered selection, and a scan of ~190
   * reporters per interaction is exactly the kind of per-frame work the map budget
   * forbids. Values come from the EXPORTER's own report, matching how the unfiltered
   * flows are assembled.
   */
  inboundBySector: Map<string, { iso: string; v: number }[]>;
  /**
   * Countries that file no export report with WITS at all.
   *
   * Not a curiosity - Russia is one of them, and it is India's largest fuel supplier.
   * Any list built purely from exporters' books therefore has holes shaped like these
   * countries, and the hole is invisible: the corridor simply is not there, which reads
   * as "no trade" rather than "nobody published it". Absent is not zero, so the inbound
   * builders fall back to the IMPORTER's own report for exactly these partners and label
   * the row with where the figure came from.
   */
  nonReporters: Set<string>;
  ready: boolean;
}

let cache: Dataset | null = null;

export function dataset(): Dataset {
  if (cache) return cache;

  const countries = read<Country[]>("countries.json", []);
  const bilateral = read<BilateralRow[]>("bilateral.json", []);
  const meta = read<Meta>("meta.json", {
    vintage: "unbuilt",
    built_at: "",
    latest_year: 0,
    tariff_year: null,
    sources: [],
    units: {},
    caveats: ["Dataset has not been built. Run: python -m data.etl.pipelines.build"],
    stats: {},
  });

  const exportIndex = new Map<string, number>();
  const importIndex = new Map<string, number>();
  const exportsByReporter = new Map<string, BilateralRow[]>();
  const importsByReporter = new Map<string, BilateralRow[]>();

  for (const row of bilateral) {
    const key = `${row.r}|${row.p}`;
    if (row.f === "x") {
      exportIndex.set(key, row.v);
      const list = exportsByReporter.get(row.r);
      if (list) list.push(row);
      else exportsByReporter.set(row.r, [row]);
    } else {
      importIndex.set(key, row.v);
      const list = importsByReporter.get(row.r);
      if (list) list.push(row);
      else importsByReporter.set(row.r, [row]);
    }
  }
  for (const list of exportsByReporter.values()) list.sort((a, b) => b.v - a.v);
  for (const list of importsByReporter.values()) list.sort((a, b) => b.v - a.v);

  const sectors = read<BilateralSectorsFile>("bilateral_sectors.json", {
    codes: [],
    flows: {},
  });
  const mirror = read<MirrorFile>("mirror.json", {
    codes: [],
    method: "",
    year: 0,
    countries: {},
  });

  // Who filed an export report of any kind. Everyone else is a non-reporter, and their
  // side of a corridor has to come from whoever traded with them.
  const filedExports = new Set<string>();
  for (const [reporter, byFlow] of Object.entries(sectors.flows)) {
    if (Object.keys(byFlow.x ?? {}).length > 0) filedExports.add(reporter);
  }
  const nonReporters = new Set(
    countries.map((c) => c.iso3).filter((iso) => !filedExports.has(iso)),
  );

  const inboundBySector = new Map<string, { iso: string; v: number }[]>();
  const pushInbound = (destination: string, idx: number, iso: string, v: number) => {
    const key = `${destination}|${idx}`;
    const list = inboundBySector.get(key);
    if (list) list.push({ iso, v });
    else inboundBySector.set(key, [{ iso, v }]);
  };

  for (const [reporter, byFlow] of Object.entries(sectors.flows)) {
    // Primary: the exporter's own books.
    for (const [partner, slices] of Object.entries(byFlow.x ?? {})) {
      for (const [idx, value] of slices) pushInbound(partner, idx, reporter, value);
    }
    // Fallback: this reporter's own import book, but ONLY for partners that file
    // nothing. Taking it for a partner that does report would double-count the corridor
    // and mix two measurements of the same trade in one ranked list.
    for (const [partner, slices] of Object.entries(byFlow.m ?? {})) {
      if (!nonReporters.has(partner)) continue;
      for (const [idx, value] of slices) pushInbound(reporter, idx, partner, value);
    }
  }
  for (const list of inboundBySector.values()) list.sort((a, b) => b.v - a.v);

  cache = {
    countries,
    byIso: new Map(countries.map((c) => [c.iso3, c])),
    totals: read("totals.json", {}),
    bilateral,
    products: read("products.json", {}),
    tariffs: read("tariffs.json", {}),
    context: read("context.json", {}),
    indicators: read<IndicatorFile>("indicators.json", {
      catalog: [],
      families: {},
      frontiers: {},
      series: {},
    }),
    meta,
    exportIndex,
    importIndex,
    exportsByReporter,
    importsByReporter,
    sectors,
    mirror,
    inboundBySector,
    nonReporters,
    ready: countries.length > 0 && bilateral.length > 0,
  };
  return cache;
}

export function provenance(): Provenance {
  const { meta } = dataset();
  return {
    source: meta.sources.map((s) => s.name).join(" · ") || "unbuilt",
    vintage: meta.vintage,
    caveats: meta.caveats,
  };
}

export function latestYear(): number {
  return dataset().meta.latest_year || 2022;
}

/**
 * The year the published tariff rates are for.
 *
 * Callers showing a tariff must use this rather than `latestYear()`. Borrowing the trade
 * frontier works only for as long as the two datasets happen to agree, and the moment
 * WITS moves one and not the other every rate on the site would be captioned with a year
 * it does not belong to. Null means the build did not record one - say so, do not guess.
 */
export function tariffYear(): number | null {
  return dataset().meta.tariff_year ?? null;
}

export function getCountry(iso3: string): Country | undefined {
  return dataset().byIso.get(iso3.toUpperCase());
}

export function allCountries(): Country[] {
  return dataset().countries;
}

/** Totals for one country-year. Returns undefined keys for not-reported, never 0. */
export function totalsFor(iso3: string, year: number): YearTotals {
  return dataset().totals[iso3]?.[String(year)] ?? {};
}

export function seriesFor(iso3: string): { year: number; exports: number | null; imports: number | null }[] {
  const years = dataset().totals[iso3];
  if (!years) return [];
  return Object.keys(years)
    .map(Number)
    .sort((a, b) => a - b)
    .map((year) => ({
      year,
      exports: years[String(year)].x ?? null,
      imports: years[String(year)].m ?? null,
    }));
}

export function bilateralValue(reporter: string, partner: string, flow: "x" | "m"): number | null {
  const index = flow === "x" ? dataset().exportIndex : dataset().importIndex;
  return index.get(`${reporter}|${partner}`) ?? null;
}

export function partnersFor(iso3: string, flow: "x" | "m", limit = 10): BilateralRow[] {
  const source = flow === "x" ? dataset().exportsByReporter : dataset().importsByReporter;
  return (source.get(iso3) ?? []).slice(0, limit);
}

export function productsFor(iso3: string, flow: "x" | "m"): ProductRow[] {
  return dataset().products[iso3]?.[flow] ?? [];
}

export function tariffApplied(reporter: string, partner: string): number | null {
  return dataset().tariffs[reporter]?.[partner] ?? null;
}

/** Simple average of the tariffs a country applies across all its partners. */
export function avgTariff(iso3: string): number | null {
  const rates = Object.values(dataset().tariffs[iso3] ?? {});
  if (!rates.length) return null;
  return rates.reduce((sum, r) => sum + r, 0) / rates.length;
}

export function gdpFor(iso3: string, year: number): number | null {
  return dataset().context[iso3]?.gdp?.[String(year)] ?? null;
}

// ---------------------------------------------------------------- context layer

/**
 * Per-series distribution across every reporting country, computed once.
 *
 * A logistics score of 3.4 says nothing on its own - the reader has no idea whether the
 * scale runs to 5 or to 500, or where the middle is. The median and the rank are what
 * turn a number into a fact, and computing them per request would mean walking ~200
 * countries on every page view.
 *
 * Each country is compared at ITS OWN newest year, not at a shared one. Half the series
 * here are surveys that only run every few years, so pinning one year would silently
 * drop every country that missed that round.
 */
interface IndicatorStats {
  median: number | null;
  /** iso3 -> rank, 1 = highest raw value. Direction is applied at the display edge. */
  ranks: Map<string, number>;
  reporting: number;
}

let indicatorStatsCache: Map<string, IndicatorStats> | null = null;

function indicatorStats(): Map<string, IndicatorStats> {
  if (indicatorStatsCache) return indicatorStatsCache;
  const { indicators } = dataset();
  const out = new Map<string, IndicatorStats>();

  for (const spec of indicators.catalog) {
    // A series the catalogue marks non-comparable gets no distribution at all. Computing
    // one and leaving the UI to remember not to render it is how it eventually renders.
    if (spec.cross_country === false) {
      out.set(spec.key, { median: null, ranks: new Map(), reporting: 0 });
      continue;
    }
    const latest: { iso: string; value: number }[] = [];
    for (const [iso, byKey] of Object.entries(indicators.series)) {
      const byYear = byKey[spec.key];
      if (!byYear) continue;
      const year = latestKey(byYear);
      if (year === null) continue;
      latest.push({ iso, value: byYear[year] });
    }
    latest.sort((a, b) => b.value - a.value);
    const ranks = new Map<string, number>();
    latest.forEach((row, i) => ranks.set(row.iso, i + 1));
    const mid = Math.floor(latest.length / 2);
    const median = latest.length
      ? latest.length % 2
        ? latest[mid].value
        : (latest[mid - 1].value + latest[mid].value) / 2
      : null;
    out.set(spec.key, { median, ranks, reporting: latest.length });
  }

  indicatorStatsCache = out;
  return out;
}

/** Newest year key in a `{year: value}` map, as a string, or null if empty. */
function latestKey(byYear: Record<string, number>): string | null {
  let best: string | null = null;
  for (const year of Object.keys(byYear)) {
    if (best === null || Number(year) > Number(best)) best = year;
  }
  return best;
}

export function indicatorFamilies(): { id: string; label: string; blurb: string }[] {
  const { indicators } = dataset();
  // Ordered by the catalogue, so the families appear in the order the connector
  // declares them rather than in whatever order the JSON object happens to enumerate.
  const seen: string[] = [];
  for (const spec of indicators.catalog) {
    if (!seen.includes(spec.family)) seen.push(spec.family);
  }
  return seen.map((id) => {
    const family: IndicatorFamily = indicators.families[id] ?? { label: id, blurb: "" };
    return { id, label: family.label, blurb: family.blurb };
  });
}

/**
 * Every context reading a country has, grouped by family and in catalogue order.
 *
 * A series the country does not report is simply absent - it never appears as a zero.
 * Callers get the newest year the COUNTRY has, plus the newest year the SERIES has, so
 * a screen can say "2018" beside a lead time sitting next to a 2023 trade figure.
 */
export function indicatorsFor(iso3: string): Record<string, IndicatorReading[]> {
  const { indicators } = dataset();
  const byKey = indicators.series[iso3];
  if (!byKey) return {};
  const stats = indicatorStats();
  const out: Record<string, IndicatorReading[]> = {};

  for (const spec of indicators.catalog) {
    const byYear = byKey[spec.key];
    if (!byYear) continue;
    const year = latestKey(byYear);
    if (year === null) continue;
    const stat = stats.get(spec.key);
    const history = Object.entries(byYear)
      .map(([y, value]) => ({ year: Number(y), value }))
      .sort((a, b) => a.year - b.year);

    (out[spec.family] ??= []).push({
      spec,
      year: Number(year),
      value: byYear[year],
      frontier: indicators.frontiers[spec.key] ?? null,
      median: stat?.median ?? null,
      rank: stat?.ranks.get(iso3) ?? null,
      reporting: stat?.reporting ?? 0,
      history,
    });
  }

  return out;
}

/** One reading, for callers that want a single series rather than a whole family. */
export function indicatorFor(iso3: string, key: string): IndicatorReading | null {
  for (const readings of Object.values(indicatorsFor(iso3))) {
    const hit = readings.find((r) => r.spec.key === key);
    if (hit) return hit;
  }
  return null;
}

export function indicatorCatalog(): IndicatorSpec[] {
  return dataset().indicators.catalog;
}

/** World total exports for a year, summed over reporting countries only. */
export function worldExports(year: number): number {
  const { totals } = dataset();
  let sum = 0;
  for (const iso of Object.keys(totals)) {
    sum += totals[iso]?.[String(year)]?.x ?? 0;
  }
  return sum;
}

/** Descending export rank. Countries that do not report are unranked (null). */
export function exportRank(iso3: string, year: number): number | null {
  const { totals } = dataset();
  const mine = totals[iso3]?.[String(year)]?.x;
  if (mine === undefined) return null;
  let rank = 1;
  for (const iso of Object.keys(totals)) {
    const value = totals[iso]?.[String(year)]?.x;
    if (value !== undefined && value > mine) rank += 1;
  }
  return rank;
}

/**
 * Herfindahl-Hirschman index over a country's export product mix, 0-10000.
 * Low = diversified, high = concentrated in a few sectors.
 */
export function diversificationHHI(iso3: string): number | null {
  const products = productsFor(iso3, "x");
  if (!products.length) return null;
  const total = products.reduce((sum, p) => sum + p.value, 0);
  if (total <= 0) return null;
  return products.reduce((sum, p) => sum + Math.pow((p.value / total) * 100, 2), 0);
}

// ------------------------------------------------------------- corridor sectors
//
// WITS aggregates corridor totals and corridor-by-sector separately, so a corridor's
// slices do not always add up to its published total. Nothing here scales one to fit the
// other; callers that show both should show the gap. See the caveat in meta.json.

/**
 * A partner in a flow list, carrying WHERE the figure came from.
 *
 * `exporter` is the seller's own report, which is the default and the preferred one.
 * `importer` means the seller publishes nothing and this is the buyer's own customs
 * record of the same goods - a different measurement basis, so the UI says which.
 */
export interface PartnerValue {
  iso: string;
  v: number;
  src: FigureSource;
}

/** True once the corridor-sector cube is present. Screens gate their sector UI on this. */
export function hasSectorDetail(): boolean {
  return dataset().sectors.codes.length > 0;
}

function sectorCodeAt(index: number): { code: string; name: string } | null {
  const { sectors } = dataset();
  const code = sectors.codes[index];
  if (!code) return null;
  return { code, name: SECTOR_NAMES[code] ?? code };
}

/**
 * Sector split of one direction of one corridor, largest first.
 *
 * `flow` is read from the REPORTER's own books: `x` is what `reporter` says it sold to
 * `partner`, `m` is what it says it bought from them. The two are different measurements
 * of overlapping trade, not interchangeable.
 */
export function corridorSectors(
  reporter: string,
  partner: string,
  flow: "x" | "m",
): CorridorSectorRow[] {
  const slices = dataset().sectors.flows[reporter]?.[flow]?.[partner] ?? [];
  const out: CorridorSectorRow[] = [];
  for (const [index, value] of slices) {
    const meta = sectorCodeAt(index);
    if (meta) out.push({ ...meta, value });
  }
  return out;
}

/** One sector's value in one direction of one corridor, or null if not reported. */
export function corridorSectorValue(
  reporter: string,
  partner: string,
  flow: "x" | "m",
  sector: string,
): number | null {
  const { sectors } = dataset();
  const index = sectors.codes.indexOf(sector);
  if (index < 0) return null;
  const slices = sectors.flows[reporter]?.[flow]?.[partner];
  if (!slices) return null;
  return slices.find(([i]) => i === index)?.[1] ?? null;
}

/**
 * A country's partners in ONE sector, both directions, ranked within each.
 *
 * Outbound comes from the country's own export report; inbound comes from each partner's
 * export report, so both sides are measured the same way rather than one being the
 * mirror of the other - the same convention the unfiltered map flows use.
 */
export function sectorPartners(
  iso3: string,
  sector: string,
  limit = 6,
): {
  exports: PartnerValue[];
  imports: PartnerValue[];
  /** Totals BEFORE the limit, so a UI can say "6 of 71" rather than implying 6 is all. */
  exportCount: number;
  importCount: number;
} {
  const { sectors, inboundBySector, nonReporters } = dataset();
  const index = sectors.codes.indexOf(sector);
  if (index < 0) return { exports: [], imports: [], exportCount: 0, importCount: 0 };

  const outbound: { iso: string; v: number }[] = [];
  for (const [partner, slices] of Object.entries(sectors.flows[iso3]?.x ?? {})) {
    const hit = slices.find(([i]) => i === index);
    if (hit) outbound.push({ iso: partner, v: hit[1] });
  }
  outbound.sort((a, b) => b.v - a.v);

  const allInbound = inboundBySector.get(`${iso3}|${index}`) ?? [];

  return {
    exports: outbound.slice(0, limit).map((row) => ({ ...row, src: "exporter" as const })),
    imports: allInbound.slice(0, limit).map((row) => ({
      ...row,
      src: nonReporters.has(row.iso) ? ("importer" as const) : ("exporter" as const),
    })),
    exportCount: outbound.length,
    importCount: allInbound.length,
  };
}

/**
 * A country's partners in BOTH directions across all sectors, same sourcing rules.
 *
 * Outbound is the country's own export book. Inbound is each partner's export book,
 * falling back to this country's own import book for partners that file nothing - which
 * is what keeps Russia, Iran and the other non-reporters from vanishing out of lists they
 * belong at the top of.
 */
export function flowPartners(
  iso3: string,
  year: number,
  limit = 6,
): {
  exports: PartnerValue[];
  imports: PartnerValue[];
  exportCount: number;
  importCount: number;
} {
  const { bilateral, nonReporters } = dataset();
  const exports: PartnerValue[] = [];
  const imports: PartnerValue[] = [];

  for (const row of bilateral) {
    if (row.y !== year) continue;
    if (row.f === "x") {
      if (row.r === iso3) exports.push({ iso: row.p, v: row.v, src: "exporter" });
      else if (row.p === iso3) imports.push({ iso: row.r, v: row.v, src: "exporter" });
    } else if (row.f === "m" && row.r === iso3 && nonReporters.has(row.p)) {
      imports.push({ iso: row.p, v: row.v, src: "importer" });
    }
  }

  exports.sort((a, b) => b.v - a.v);
  imports.sort((a, b) => b.v - a.v);
  return {
    exports: exports.slice(0, limit),
    imports: imports.slice(0, limit),
    exportCount: exports.length,
    importCount: imports.length,
  };
}


// ------------------------------------------------------------- world explorer
//
// Everything below scans the corridor-sector cube (435k slices). Each builder does ONE
// pass and memoizes, because the explorer asks several of these questions per render and
// a scan per question turns a page render into seconds of CPU.

interface ExplorerIndex {
  /** sector code -> every corridor in it, largest first. */
  corridorsBySector: Map<string, CorridorRow[]>;
  overview: SectorOverview[];
}

let explorerCache: ExplorerIndex | null = null;

/**
 * One pass over the cube, producing both the per-sector corridor lists and the summary.
 *
 * The inbound fallback matters as much here as it does on the map: without it every
 * ranking on the explorer would be missing Russia, Iran and the other non-reporters, and
 * a "top fuel corridors" table that omits Russia to India is not a top-corridors table.
 * A corridor is taken from the seller's books when the seller reports, and from the
 * buyer's only when the seller reports nothing at all - never both, or the pair would be
 * counted twice.
 */
function explorerIndex(): ExplorerIndex {
  if (explorerCache) return explorerCache;
  const { sectors, nonReporters } = dataset();

  const byCode = new Map<string, CorridorRow[]>();
  const exporterTotals = new Map<string, Map<string, number>>();
  const importerTotals = new Map<string, Map<string, number>>();

  const bump = (
    store: Map<string, Map<string, number>>,
    code: string,
    iso: string,
    v: number,
  ) => {
    let inner = store.get(code);
    if (!inner) store.set(code, (inner = new Map()));
    inner.set(iso, (inner.get(iso) ?? 0) + v);
  };

  const add = (
    code: string,
    seller: string,
    buyer: string,
    v: number,
    src: CorridorRow["src"],
  ) => {
    const row: CorridorRow = { reporter: seller, partner: buyer, value: v, src };
    const list = byCode.get(code);
    if (list) list.push(row);
    else byCode.set(code, [row]);
    bump(exporterTotals, code, seller, v);
    bump(importerTotals, code, buyer, v);
  };

  for (const [reporter, byFlow] of Object.entries(sectors.flows)) {
    for (const [partner, slices] of Object.entries(byFlow.x ?? {})) {
      for (const [idx, value] of slices) {
        const code = sectors.codes[idx];
        if (code) add(code, reporter, partner, value, "exporter");
      }
    }
    for (const [partner, slices] of Object.entries(byFlow.m ?? {})) {
      if (!nonReporters.has(partner)) continue;
      for (const [idx, value] of slices) {
        const code = sectors.codes[idx];
        if (code) add(code, partner, reporter, value, "importer");
      }
    }
  }

  for (const list of byCode.values()) list.sort((a, b) => b.value - a.value);

  const best = (m: Map<string, number>) => {
    let top: { iso: string; value: number } | null = null;
    for (const [iso, value] of m) if (!top || value > top.value) top = { iso, value };
    return top;
  };

  const overview: SectorOverview[] = sectors.codes.map((code) => {
    const rows = byCode.get(code) ?? [];
    const sellers = exporterTotals.get(code) ?? new Map<string, number>();
    const buyers = importerTotals.get(code) ?? new Map<string, number>();
    const worldTrade = rows.reduce((sum, r) => sum + r.value, 0);

    // Concentration is measured over SELLERS, which is the question the explorer asks:
    // how many places can you actually buy this from.
    const hhi =
      worldTrade > 0
        ? [...sellers.values()].reduce((sum, v) => sum + Math.pow((v / worldTrade) * 100, 2), 0)
        : null;

    return {
      code,
      name: SECTOR_NAMES[code] ?? code,
      worldTrade,
      corridors: rows.length,
      exporters: sellers.size,
      importers: buyers.size,
      hhi,
      topExporter: best(sellers),
      topImporter: best(buyers),
    };
  });

  overview.sort((a, b) => b.worldTrade - a.worldTrade);
  explorerCache = { corridorsBySector: byCode, overview };
  return explorerCache;
}

/** All 16 sectors summarised, largest world trade first. */
export function sectorOverview(): SectorOverview[] {
  return explorerIndex().overview;
}

/** One sector's summary, or null if the code is not a published HS section group. */
export function sectorSummary(code: string): SectorOverview | null {
  return explorerIndex().overview.find((s) => s.code === code) ?? null;
}

export interface CorridorQuery {
  /** Empty means every sector, using corridor totals rather than the sector cube. */
  sector?: string;
  /** ISO3 of either end. Matches a corridor in either direction. */
  country?: string;
  /** Region name at least one end must sit in. */
  region?: string;
  /** Corridors below this USD value are dropped. */
  minValue?: number;
  limit?: number;
}

/**
 * Ranked corridors under a set of filters.
 *
 * With no sector this reads the corridor TOTALS, not the sum of the sector cube. The two
 * are separate WITS aggregations, and summing the cube would quietly produce a different
 * world total than every other screen shows.
 */
export function findCorridors(query: CorridorQuery): CorridorRow[] {
  const { sector, country, region, minValue = 0, limit = 50 } = query;
  const { byIso, nonReporters, bilateral } = dataset();

  let rows: CorridorRow[];
  if (sector) {
    rows = explorerIndex().corridorsBySector.get(sector) ?? [];
  } else {
    const totals: CorridorRow[] = [];
    for (const row of bilateral) {
      if (row.f === "x") {
        totals.push({ reporter: row.r, partner: row.p, value: row.v, src: "exporter" });
      } else if (row.f === "m" && nonReporters.has(row.p)) {
        totals.push({ reporter: row.p, partner: row.r, value: row.v, src: "importer" });
      }
    }
    totals.sort((a, b) => b.value - a.value);
    rows = totals;
  }

  const iso = country ? country.toUpperCase() : "";
  const out: CorridorRow[] = [];
  for (const row of rows) {
    if (row.value < minValue) continue;
    if (iso && row.reporter !== iso && row.partner !== iso) continue;
    if (region) {
      const ra = byIso.get(row.reporter)?.region?.trim();
      const rb = byIso.get(row.partner)?.region?.trim();
      if (ra !== region && rb !== region) continue;
    }
    out.push(row);
    if (out.length >= limit) break;
  }
  return out;
}

/** How many corridors match a query in total, before the display limit. */
export function countCorridors(query: CorridorQuery): number {
  return findCorridors({ ...query, limit: Number.MAX_SAFE_INTEGER }).length;
}

/** Countries ranked within one sector, both directions paired on one row. */
export function sectorCountryRanking(
  code: string,
  limit = 15,
): { iso: string; exports: number | null; imports: number | null }[] {
  const rows = explorerIndex().corridorsBySector.get(code) ?? [];
  const sold = new Map<string, number>();
  const bought = new Map<string, number>();
  for (const row of rows) {
    sold.set(row.reporter, (sold.get(row.reporter) ?? 0) + row.value);
    bought.set(row.partner, (bought.get(row.partner) ?? 0) + row.value);
  }
  const isos = new Set([...sold.keys(), ...bought.keys()]);
  return (
    [...isos]
      .map((iso) => ({
        iso,
        exports: sold.get(iso) ?? null,
        imports: bought.get(iso) ?? null,
      }))
      // Ranked by TOTAL trade, never one side - ranking by exports reorders the list
      // depending on which direction you happen to be looking at.
      .sort((a, b) => (b.exports ?? 0) + (b.imports ?? 0) - ((a.exports ?? 0) + (a.imports ?? 0)))
      .slice(0, limit)
  );
}

/** The regions present in the country reference, for the explorer's region filter. */
export function allRegions(): string[] {
  const seen = new Set<string>();
  for (const c of dataset().countries) if (c.region) seen.add(c.region.trim());
  return [...seen].sort();
}

// ------------------------------------------------------------- mirror estimates
//
// 61 economies file no trade report at all - Russia, Iraq, Bangladesh, Algeria, Iran and
// 56 others - and UN Comtrade has nothing for them either (verified live for RUS and BGD,
// 2023: HTTP 200, zero rows). Their trade is rebuilt from what their partners report,
// which is the same mirror method the OEC applies to the same problem.
//
// These are ESTIMATES and the type says so. Nothing here is merged into `totalsFor` or
// `productsFor`: a caller that wants a mirror figure asks for one, and every screen that
// shows one labels it. Blending the two would put a derived number under the same styling
// as a customs declaration, which is the single easiest way to lose a reader's trust.

export interface MirrorEstimate {
  iso3: string;
  exports: number | null;
  imports: number | null;
  /** Partners contributing to each side. A total from 3 partners is not one from 130. */
  exportPartners: number;
  importPartners: number;
  year: number;
  sectors: { code: string; name: string; exports: number | null; imports: number | null }[];
}

/** The mirror estimate for a silent economy, or null if it reports for itself. */
export function mirrorFor(iso3: string): MirrorEstimate | null {
  const { mirror } = dataset();
  const row = mirror.countries[iso3.toUpperCase()];
  if (!row) return null;

  const bySector = new Map<
    string,
    { code: string; name: string; exports: number | null; imports: number | null }
  >();
  const put = (index: number, value: number, side: "exports" | "imports") => {
    const code = mirror.codes[index];
    if (!code) return;
    const existing = bySector.get(code);
    if (existing) existing[side] = value;
    else
      bySector.set(code, {
        code,
        name: SECTOR_NAMES[code] ?? code,
        exports: side === "exports" ? value : null,
        imports: side === "imports" ? value : null,
      });
  };
  for (const [index, value] of row.sectors.x) put(index, value, "exports");
  for (const [index, value] of row.sectors.m) put(index, value, "imports");

  return {
    iso3: iso3.toUpperCase(),
    exports: row.exports,
    imports: row.imports,
    exportPartners: row.exportPartners,
    importPartners: row.importPartners,
    year: mirror.year,
    // Ranked by TOTAL trade, never one side - the standing rule for every paired list.
    sectors: [...bySector.values()].sort(
      (a, b) => (b.exports ?? 0) + (b.imports ?? 0) - ((a.exports ?? 0) + (a.imports ?? 0)),
    ),
  };
}

/** How the mirror figures were built, for the methodology page. */
export function mirrorMethod(): { method: string; year: number; countries: number } {
  const { mirror } = dataset();
  return {
    method: mirror.method,
    year: mirror.year,
    countries: Object.keys(mirror.countries).length,
  };
}

/**
 * A silent economy's partners, rebuilt from the other side of each corridor.
 *
 * `partnersFor` reads the country's own export/import books and returns nothing for these
 * economies, because there are no books. Here the inversion is explicit: a reporter's
 * IMPORT record naming this country as the source is one of its exports, and a reporter's
 * EXPORT record naming it as the destination is one of its imports.
 */
export function mirrorPartners(
  iso3: string,
  limit = 40,
): { exports: { iso3: string; value: number }[]; imports: { iso3: string; value: number }[] } {
  const iso = iso3.toUpperCase();
  const { bilateral } = dataset();
  const sold: { iso3: string; value: number }[] = [];
  const bought: { iso3: string; value: number }[] = [];

  for (const row of bilateral) {
    if (row.p !== iso) continue;
    if (row.f === "m") sold.push({ iso3: row.r, value: row.v });
    else bought.push({ iso3: row.r, value: row.v });
  }
  sold.sort((a, b) => b.value - a.value);
  bought.sort((a, b) => b.value - a.value);
  return { exports: sold.slice(0, limit), imports: bought.slice(0, limit) };
}
