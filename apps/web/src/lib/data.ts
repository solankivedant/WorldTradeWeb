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

interface Meta {
  vintage: string;
  built_at: string;
  latest_year: number;
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
  meta: Meta;
  /** exports keyed `${reporter}|${partner}` for O(1) corridor lookup */
  exportIndex: Map<string, number>;
  importIndex: Map<string, number>;
  exportsByReporter: Map<string, BilateralRow[]>;
  importsByReporter: Map<string, BilateralRow[]>;
  sectors: BilateralSectorsFile;
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
    meta,
    exportIndex,
    importIndex,
    exportsByReporter,
    importsByReporter,
    sectors,
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
