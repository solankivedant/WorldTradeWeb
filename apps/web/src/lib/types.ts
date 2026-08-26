/** Shared shapes. Trade values are USD numbers; tariffs are percent. */

export type Flow = "export" | "import";
/** Wire-format flow key, as published by the ETL. */
export type FlowKey = "x" | "m";

export interface Country {
  iso3: string;
  iso2: string | null;
  name: string;
  region: string | null;
  incomeGroup: string | null;
  capital: string | null;
  lat: number | null;
  lon: number | null;
}

export interface YearTotals {
  /** exports, USD. Absent means not reported - never coerce to 0. */
  x?: number;
  /** imports, USD. Absent means not reported. */
  m?: number;
}

export interface BilateralRow {
  r: string;
  p: string;
  f: FlowKey;
  v: number;
  y: number;
}

export interface ProductRow {
  code: string;
  name: string;
  value: number;
}

/** One sector's slice of one direction of one corridor. */
export interface CorridorSectorRow {
  code: string;
  name: string;
  value: number;
}

/**
 * Whose books a figure came from.
 *
 * `exporter` is the seller's own report and the default. `importer` means the seller
 * publishes nothing at all - Russia, Iran and about thirty others - and this is the
 * buyer's customs record of the same goods. A different measurement basis, so it is
 * labelled wherever it appears rather than blended in silently.
 */
export type FigureSource = "exporter" | "importer";

/** One sector, summed across every corridor on earth. */
export interface SectorOverview {
  code: string;
  name: string;
  worldTrade: number;
  corridors: number;
  exporters: number;
  importers: number;
  /** Herfindahl-Hirschman over exporter shares, 0-10000. High = few sellers dominate. */
  hhi: number | null;
  topExporter: { iso: string; value: number } | null;
  topImporter: { iso: string; value: number } | null;
}

/** One directed corridor in a ranked list. */
export interface CorridorRow {
  reporter: string;
  partner: string;
  value: number;
  src: FigureSource;
}

export interface Provenance {
  source: string;
  vintage: string;
  caveats: string[];
}

/** Every API response carries this. Do not strip it to simplify a payload. */
export interface WithMeta<T> {
  data: T;
  meta: Provenance;
}

export interface CountrySummary {
  country: Country;
  year: number;
  exports: number | null;
  imports: number | null;
  balance: number | null;
  exportGrowth: number | null;
  importGrowth: number | null;
  exportRank: number | null;
  worldExportShare: number | null;
  series: { year: number; exports: number | null; imports: number | null }[];
  topExportProducts: ProductRow[];
  topImportProducts: ProductRow[];
  topExportPartners: PartnerRow[];
  topImportPartners: PartnerRow[];
  avgTariffApplied: number | null;
  tradeToGdp: number | null;
  diversification: number | null;
}

export interface PartnerRow {
  iso3: string;
  name: string;
  iso2: string | null;
  value: number;
  share: number | null;
}

export interface CorridorSummary {
  a: Country;
  b: Country;
  year: number;
  /** A's reported exports to B. */
  aToB: number | null;
  /** B's reported exports to A. */
  bToA: number | null;
  /** B's reported imports from A - the mirror of aToB. Shown, not reconciled. */
  aToBMirror: number | null;
  bToAMirror: number | null;
  mirrorGapPct: number | null;
  balance: number | null;
  tariffAOnB: number | null;
  tariffBOnA: number | null;
  aShareOfBImports: number | null;
  bShareOfAImports: number | null;
  aTopProducts: ProductRow[];
  bTopProducts: ProductRow[];
  gaps: GapRow[];
}

/** What B imports heavily from the world but not from A. */
export interface GapRow {
  code: string;
  name: string;
  destinationImports: number;
  originExports: number;
  originWorldShare: number | null;
}

export interface ProductSummary {
  code: string;
  name: string;
  year: number;
  worldExports: number;
  topExporters: PartnerRow[];
  topImporters: PartnerRow[];
  hhi: number | null;
  countryCount: number;
}

export interface Opportunity {
  origin: string;
  originName: string;
  destination: string;
  destinationName: string;
  destinationIso2: string | null;
  /** World Bank region of the destination, for grouping and filtering result sets. */
  destinationRegion: string | null;
  sector: string;
  sectorName: string;
  score: number;
  components: ScoreComponent[];
  evidence: {
    destinationImports: number;
    originSectorExports: number;
    currentBilateral: number | null;
    currentShare: number | null;
    originWorldShare: number | null;
    tariff: number | null;
    destinationGrowth: number | null;
  };
}

export interface ScoreComponent {
  label: string;
  points: number;
  /** The most this component could contribute, so a card can show points as a share of
   *  what was available rather than as a bare number with no scale. */
  max: number;
  reason: string;
}

/**
 * One series in the context layer - the things a customs record does not measure.
 *
 * `basis` is the field that stops these being read as trade. A services figure is
 * BALANCE-OF-PAYMENTS data, a logistics score is a SURVEY of forwarders' perceptions,
 * a governance estimate is a COMPOSITE of many sources. None of them may be added to a
 * goods total, and a screen that shows one beside a goods figure has to say which is
 * which.
 *
 * Shape mirrors `indicators.json` exactly, whose catalogue travels with its own data for
 * the same reason `codes` ships inside bilateral_sectors.json: a label held somewhere
 * else drifts, and then every figure is quietly mislabelled.
 */
export interface IndicatorSpec {
  key: string;
  /** The source's own indicator code, so any figure can be re-fetched and checked. */
  code: string;
  family: string;
  label: string;
  unit: "usd" | "teu" | "days" | "index" | "score" | "percent" | "lcu-per-usd";
  basis: string;
  note: string;
  range?: [number, number];
  higher_is_better?: boolean | null;
  /**
   * False for a series that is real over time for ONE country and meaningless between
   * them - the exchange rate, the GDP deflator. Rank and median are suppressed for
   * these rather than computed and shown, because both would be inventions.
   */
  cross_country?: boolean;
}

export interface IndicatorFamily {
  label: string;
  blurb: string;
}

export interface IndicatorFile {
  catalog: IndicatorSpec[];
  families: Record<string, IndicatorFamily>;
  /** Newest year each series publishes for anyone. They do not agree with each other. */
  frontiers: Record<string, number>;
  series: Record<string, Record<string, Record<string, number>>>;
}

/** One country's reading of one series, with everything a caller needs to label it. */
export interface IndicatorReading {
  spec: IndicatorSpec;
  /** The newest year THIS country has. Not the same as the series frontier. */
  year: number;
  value: number;
  /** Newest year anyone has, so a country lagging the source reads as lagging. */
  frontier: number | null;
  /** Median across every country at that country's own newest year, for context. */
  median: number | null;
  /** This country's rank among countries reporting the series, 1 = highest value. */
  rank: number | null;
  reporting: number;
  history: { year: number; value: number }[];
}

/**
 * Country totals for years past the WITS frontier, from UN Comtrade.
 *
 * Its OWN file and its own access functions, never merged into `totals.json`. A series
 * whose 2010-2023 came from WITS and whose 2024 came from Comtrade, with nothing on the
 * row saying so, is a series where nobody can tell a real discontinuity from a source
 * change. Same rule the mirror estimates follow.
 */
export interface FrontierFile {
  source: string;
  vintage: string;
  built_at: string;
  units: string;
  note: string;
  /** Per year: how many countries filed, and whether that is enough to call it complete. */
  years: Record<string, { reporters: number; complete: boolean }>;
  totals: Record<string, Record<string, { x?: number; m?: number; xr?: boolean; mr?: boolean }>>;
}

/**
 * HS chapter 88 - aircraft and spacecraft.
 *
 * A SUBSET of the `86-89_Transport` section group, never a seventeenth sector. `xr`/`mr`
 * are false where the source derived the chapter total by summing the country's HS-6
 * lines rather than the country filing that aggregate itself.
 */
export interface AviationFile {
  source: string;
  vintage: string;
  built_at: string;
  units: string;
  note: string;
  hs_chapter: string;
  within_group: string;
  classification: string;
  years: number[];
  totals: Record<string, Record<string, { x?: number; m?: number; xr?: boolean; mr?: boolean }>>;
}
