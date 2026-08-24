export type FlowDirection = "export" | "import";

export interface Flow {
  from: [number, number];
  to: [number, number];
  /** Great-circle midpoint, where the arrow and value label sit. */
  mid: [number, number];
  /** Text rotation at the midpoint, degrees, already normalised to stay upright. */
  angle: number;
  v: number;
  dir: FlowDirection;
  partner: string;
  src: "exporter" | "importer";
}

export interface PartnerValue {
  iso: string;
  v: number;
  /**
   * Whose books this figure came from. `exporter` is the seller's own report and the
   * default; `importer` means the seller publishes nothing at all (Russia, Iran and
   * about thirty others) and this is the buyer's customs record of the same goods.
   * A different measurement basis, so it is labelled rather than blended in silently.
   */
  src: "exporter" | "importer";
}

/** The single largest group on one side, mirrored from `lib/pairing`'s LeadingSector. */
export interface LeadingSectorSlice {
  code: string;
  name: string;
  value: number;
  share: number;
  ofGroups: number;
}

export interface SectorSlice {
  code: string;
  name: string;
  exports: number | null;
  imports: number | null;
  net: number | null;
}

/** Everything the floating country panel and the flow layers need. */
export interface CountryDetail {
  iso3: string;
  iso2: string | null;
  name: string;
  region: string | null;
  exports: number | null;
  imports: number | null;
  prevExports: number | null;
  prevImports: number | null;
  rank: number | null;
  hhi: number | null;
  sectors: SectorSlice[];
  /**
   * What this country sells most and buys most, each ranked within its OWN direction.
   *
   * Not derivable from `sectors` above: that list is the top five by COMBINED trade, so
   * the largest export can sit at rank four or be missing from it entirely. Both sides
   * always travel together - see `TopSectors`.
   */
  topExportSector: LeadingSectorSlice | null;
  topImportSector: LeadingSectorSlice | null;
  /** Set when the map's sector lens is active. Every figure above is narrowed to it. */
  sectorFilter: { code: string; name: string } | null;
  topExports: PartnerValue[];
  topImports: PartnerValue[];
  exportPartnerCount: number;
  importPartnerCount: number;
  flows: Flow[];
}

/** Both lenses compare exports against imports. Neither shows one side alone. */
export type MapMetric = "volume" | "balance";

export interface MapPayload {
  year: number;
  metric: MapMetric;
  sector: string | null;
  values: Record<string, number | null>;
  /** Exports and imports per country, so a tooltip can show the pair, not the total. */
  pairs: Record<string, { x: number | null; m: number | null }>;
  max: number;
  /** Low end of the color domain - the ramp spans [floor, max], not [1, max]. */
  floor: number;
  reportingCountries: number;
  detail: CountryDetail | null;
}

/** One corridor, as the connection panel receives it from `/api/corridor`. */
export interface ConnectionSector {
  code: string;
  name: string;
  /** A's reported exports to B in this sector. */
  aToB: number | null;
  /** B's reported exports to A in this sector. */
  bToA: number | null;
  net: number | null;
}

export interface ConnectionDetail {
  year: number;
  a: { iso3: string; iso2: string | null; name: string };
  b: { iso3: string; iso2: string | null; name: string };
  aToB: number | null;
  bToA: number | null;
  /** B's reported imports from A - the mirror of aToB. Shown, never averaged in. */
  aToBMirror: number | null;
  bToAMirror: number | null;
  mirrorGapPct: number | null;
  balanceForA: number | null;
  aShareOfAExports: number | null;
  bShareOfBExports: number | null;
  tariffBOnA: number | null;
  tariffAOnB: number | null;
  sectors: ConnectionSector[];
  /** Largest group each way, ranked within its own direction rather than combined. */
  topAToB: LeadingSectorSlice | null;
  topBToA: LeadingSectorSlice | null;
  /** Everything below the shown rows, summed so the bars still cover the whole corridor. */
  other: { count: number; aToB: number; bToA: number } | null;
  hasSectorDetail: boolean;
  /** Sides whose figures came from the buyer, because the seller publishes nothing. */
  buyerSourced: { aToB: boolean; bToA: boolean };
  focusSector: string | null;
}
