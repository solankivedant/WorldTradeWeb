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
