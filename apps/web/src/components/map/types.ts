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
}

export interface PartnerValue {
  iso: string;
  v: number;
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
