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
import type {
  BilateralRow,
  Country,
  ProductRow,
  Provenance,
  YearTotals,
} from "./types";

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
