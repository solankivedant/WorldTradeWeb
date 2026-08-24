/**
 * Chart and map color assignment.
 *
 * CSS handles theming for everything Tailwind can reach. This file exists for the two
 * places that need real JS color values: Recharts (which takes props, not classes) and
 * deck.gl (which takes RGBA arrays). Both palettes are therefore duplicated here - keep
 * them in step with the custom properties in globals.css.
 *
 * The two palettes are SELECTED, not flipped. Each is the same eight hues stepped for its
 * own surface, and each passes the dataviz validator against that surface:
 *   dark  (#1a1a19): worst adjacent CVD ΔE 8.4, normal-vision ΔE 19.3, all ≥3:1 contrast
 *   light (#fcfcfb): worst adjacent CVD ΔE 9.1, normal-vision ΔE 19.6, three slots below
 *                    3:1 - permitted because every chart here ships visible value labels
 *                    and a table view, which is the documented relief for that warning.
 *
 * Three rules the rest of the app depends on:
 *   1. Slots are assigned in FIXED ORDER, never cycled. A ninth series folds to "Other".
 *   2. Color follows the ENTITY, not its rank - a filter that drops a series must not
 *      repaint the survivors. `sectorColor()` keys on sector code, not array index.
 *   3. Sequential = one hue for magnitude. Diverging = blue↔red with a NEUTRAL midpoint,
 *      never a hue at zero, never red/green.
 */

export type Mode = "light" | "dark";

const SERIES_DARK = [
  "#3987e5", "#d95926", "#199e70", "#c98500",
  "#d55181", "#008300", "#9085e9", "#e66767",
] as const;

const SERIES_LIGHT = [
  "#2a78d6", "#eb6834", "#1baf7a", "#eda100",
  "#e87ba4", "#008300", "#4a3aa7", "#e34948",
] as const;

export function series(mode: Mode): readonly string[] {
  return mode === "dark" ? SERIES_DARK : SERIES_LIGHT;
}

/** Status colors are fixed in both modes and always ship with an icon + label. */
export const STATUS = {
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
} as const;

/** Chart chrome. Recharts needs these as values; everything else uses Tailwind classes. */
export function ink(mode: Mode) {
  return mode === "dark"
    ? {
        primary: "#ffffff",
        secondary: "#c3c2b7",
        muted: "#898781",
        grid: "#2c2c2a",
        axis: "#383835",
        surface: "#1a1a19",
        plane: "#0d0d0d",
      }
    : {
        primary: "#0b0b0b",
        secondary: "#52514e",
        muted: "#898781",
        grid: "#e1e0d9",
        axis: "#c3c2b7",
        surface: "#fcfcfb",
        plane: "#f9f9f7",
      };
}

const OTHER = { dark: "#6b6a64", light: "#a3a19a" } as const;

export function otherColor(mode: Mode): string {
  return OTHER[mode];
}

/**
 * Sector → slot. Stable across the whole app so readers learn the mapping once, and
 * stable across filters because it keys on the sector code rather than position. The 16
 * WITS product groups map onto 8 slots; the rest share the "Other" treatment rather than
 * inventing a 9th hue.
 */
const SECTOR_SLOT: Record<string, number> = {
  "84-85_MachElec": 0,
  "27-27_Fuels": 1,
  "28-38_Chemicals": 2,
  "72-83_Metals": 3,
  "86-89_Transport": 4,
  "50-63_TextCloth": 5,
  "01-05_Animal": 6,
  "06-15_Vegetable": 7,
};

export function sectorColor(code: string, mode: Mode): string {
  const slot = SECTOR_SLOT[code];
  return slot === undefined ? OTHER[mode] : series(mode)[slot];
}

/**
 * Sequential ramps, single hue.
 *
 * Light runs light→dark on a light surface; dark runs dark→light on a dark surface, so in
 * both cases "more" reads as "further from the background". Flipping one ramp to derive
 * the other would make the largest values recede into the page.
 */
const SEQUENTIAL_LIGHT = [
  "#e3eefc", "#b7d3f6", "#86b6ef", "#5598e7", "#2a78d6", "#1c5cab", "#0d366b",
];
const SEQUENTIAL_DARK = [
  "#12233b", "#173863", "#1c5cab", "#2a78d6", "#5598e7", "#86b6ef", "#b7d3f6",
];

/**
 * Log-scaled sequential color across the DATA'S OWN domain.
 *
 * Trade values span six orders of magnitude, so a linear ramp paints all but the top ten
 * countries identically. Anchoring the log ramp at 1 is barely better: with a $3.6T
 * maximum, everything from $1B upward lands in three adjacent steps and the map reads as
 * one flat color. The domain has to be [smallest reported, largest reported], which is
 * why callers pass `lo` rather than assuming it.
 */
export function sequentialColor(
  value: number | null | undefined,
  hi: number,
  mode: Mode,
  lo = 1e6,
): string | null {
  if (value === null || value === undefined) return null; // caller renders no-data, not zero
  const ramp = mode === "dark" ? SEQUENTIAL_DARK : SEQUENTIAL_LIGHT;
  if (value <= 0) return ramp[0];
  const top = Math.log10(Math.max(hi, lo * 10));
  const bottom = Math.log10(Math.max(lo, 1));
  const t = (Math.log10(value) - bottom) / (top - bottom);
  const i = Math.min(ramp.length - 1, Math.max(0, Math.round(t * (ramp.length - 1))));
  return ramp[i];
}

/**
 * Diverging ramp for trade balance. Neutral at zero - a hue at the midpoint would imply
 * that balanced trade is itself a state worth flagging. Blue = surplus, red = deficit,
 * chosen over red/green for colorblind readability.
 */
const DIVERGING = {
  dark: {
    neg: ["#f4a3a3", "#e66767", "#d03b3b", "#a52020"],
    pos: ["#a8c9f2", "#5598e7", "#2a78d6", "#1c5cab"],
    zero: "#4a4a46",
  },
  light: {
    neg: ["#f6c9c9", "#e88a8a", "#d03b3b", "#8f1d1d"],
    pos: ["#c4dcf8", "#7fb2ee", "#2a78d6", "#164a88"],
    zero: "#d8d7d0",
  },
} as const;

export function divergingColor(
  value: number | null | undefined,
  scale: number,
  mode: Mode,
  lo = 1e8,
): string | null {
  if (value === null || value === undefined) return null;
  const set = DIVERGING[mode];
  if (value === 0 || scale <= 0) return set.zero;
  const top = Math.log10(Math.max(scale, lo * 10));
  const bottom = Math.log10(lo);
  const t = Math.min(1, Math.max(0, (Math.log10(Math.abs(value)) - bottom) / (top - bottom)));
  const ramp = value > 0 ? set.pos : set.neg;
  const i = Math.min(ramp.length - 1, Math.max(0, Math.round(t * (ramp.length - 1))));
  return ramp[i];
}

export function divergingSteps(mode: Mode): string[] {
  const set = DIVERGING[mode];
  return [...[...set.neg].reverse(), set.zero, ...set.pos];
}

export function sequentialSteps(mode: Mode): string[] {
  return mode === "dark" ? [...SEQUENTIAL_DARK] : [...SEQUENTIAL_LIGHT];
}

/**
 * An ORDINAL ramp: one hue, monotone lightness, strongest step first.
 *
 * For a fixed set of ranked parts - the five score components, whose weights put them in
 * a permanent order - where a categorical palette would be wrong twice over. It would
 * claim the parts are unrelated peers when they are ranked slices of one total, and on a
 * card that already wears its sector's categorical hue it would make the same eight hues
 * mean two different things a centimetre apart.
 *
 * The pale end of the underlying sequential ramp is trimmed rather than used. Its two
 * lightest steps dissolve into a near-white card - measured, not guessed: `#b7d3f6` sits
 * at 1.50:1 against the card surface, under the 2:1 ordinal floor. Walking down from the
 * ramp's deep end instead puts the light end at `#86b6ef`, 2.06:1, which clears it.
 *
 * Both directions pass `validate_palette.js --ordinal` against the CARD surface, which is
 * what these are drawn on - not the plane. Re-run it there if either is touched:
 *   light  #0d366b,#1c5cab,#2a78d6,#5598e7,#86b6ef  on #fcfcfb
 *   dark   #b7d3f6,#86b6ef,#5598e7,#2a78d6,#1c5cab  on #1a1a19
 */
export function ordinalRamp(mode: Mode, count: number): string[] {
  const ramp = mode === "dark" ? SEQUENTIAL_DARK : SEQUENTIAL_LIGHT;
  // Both walk inward from the end that reads strongest against their own surface: the
  // brightest step on a dark card, the deepest on a light one.
  // Clamped at index 2 so a caller asking for more steps than the ramp has repeats the
  // last legible one rather than walking off into the two that fail the surface floor.
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(ramp[Math.max(2, 6 - i)]);
  return out;
}

/** Hex → deck.gl RGBA. */
export function toRGBA(hex: string, alpha = 255): [number, number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
    alpha,
  ];
}

/**
 * Flow direction colors - deliberately near-neon.
 *
 * Green for exports (goods leaving) and red for imports. These sit on top of a blue
 * choropleth, so they have to win against a mid-blue backdrop rather than a neutral one:
 * muted greens read as dark blue-green mush over ocean and landmass alike. The chosen
 * steps are high-chroma and pushed toward spring-green and rose so they separate from
 * blue by hue as well as by lightness.
 *
 * Red/green is the one pair colorblind readers struggle with most, so direction is NEVER
 * carried by color alone: every flow also has an arrowhead pointing the way the goods
 * travel, a value label, a distinct arc path, and a matching legend entry.
 *
 * `*Glow` is a lighter step of the same hue used for the halo pass under each arc, which
 * is what makes a 2px line legible over a saturated background.
 */
export function flowColors(mode: Mode) {
  return mode === "dark"
    ? {
        export: "#2bf59a",
        import: "#ff4d6d",
        exportRGB: [43, 245, 154] as [number, number, number],
        importRGB: [255, 77, 109] as [number, number, number],
        exportGlow: [120, 255, 200] as [number, number, number],
        importGlow: [255, 150, 175] as [number, number, number],
      }
    : {
        // On the light map the same hues need a step deeper to hold contrast against a
        // pale surface. This pair measures deutan CVD dE 7.4 and clears 3:1 on the map
        // surface; 7.4 sits in the documented floor band, which is legal ONLY alongside
        // secondary encoding - here that is the arrowhead, the value label, the separated
        // arc paths, and the footer legend.
        export: "#00875a",
        import: "#e00040",
        exportRGB: [0, 135, 90] as [number, number, number],
        importRGB: [224, 0, 64] as [number, number, number],
        exportGlow: [0, 196, 130] as [number, number, number],
        importGlow: [255, 74, 118] as [number, number, number],
      };
}

/** Map surfaces and the no-data fill, per theme. */
export function mapTheme(mode: Mode) {
  return mode === "dark"
    ? {
        background: "#0d0d0d",
        noData: [42, 42, 40, 255] as [number, number, number, number],
        border: [72, 72, 68, 190] as [number, number, number, number],
        borderHighlight: [255, 255, 255, 235] as [number, number, number, number],
        // Flow value labels are drawn on the GPU, so they need literal colors rather than
        // tokens. They sit on top of the map, not on a card, hence their own pair.
        labelInk: [255, 255, 255] as [number, number, number],
        labelBg: [20, 20, 19] as [number, number, number],
      }
    : {
        background: "#e8ecf1",
        noData: [206, 205, 198, 255] as [number, number, number, number],
        border: [252, 252, 251, 230] as [number, number, number, number],
        borderHighlight: [11, 11, 11, 210] as [number, number, number, number],
        labelInk: [17, 17, 17] as [number, number, number],
        labelBg: [255, 255, 255] as [number, number, number],
      };
}

/**
 * Tariff rate bands.
 *
 * Rate is a MAGNITUDE, so the ramp is ordinal: one hue, monotone lightness, stepped for
 * its own surface (light runs pale→deep on a pale page; dark runs deep→pale on a dark
 * one, so in both cases a higher rate sits further from the background). Both ramps clear
 * the ordinal checks - monotone L, adjacent ΔL ≥ 0.06, light-end contrast ≥ 2:1, single
 * hue - measured with the dataviz validator, not by eye.
 *
 * The steps are named bands rather than a continuous gradient. Two hundred rows of a
 * continuous ramp asks the eye to compare hues down a page, which is the comparison
 * people are worst at; six labelled steps let a reader say "these are the high ones"
 * without decoding a colour.
 *
 * `ink` is the text colour that clears 4.5:1 on that band's fill, so a rate can be
 * printed ON its own colour instead of only beside it. Each value was measured; do not
 * add a band without re-measuring, because the mid-blues sit right on the boundary
 * (#2f7fd8 clears black ink at 4.83 and would FAIL with white at 4.08).
 *
 * Duty-free keeps the reserved status-good colour rather than joining the ramp. It is a
 * different kind of fact - an agreement is in force - not merely a small number, and it
 * is the one band a reader scans for.
 */
export interface TariffBand {
  /** Upper bound, exclusive. A rate belongs to the first band whose `max` it is under. */
  max: number;
  label: string;
  /** The numeric range, for axis and legend hints. */
  range: string;
  /** Swatch, pill and bar fill. */
  color: string;
  /** Text colour measured to clear 4.5:1 on `color`. */
  ink: string;
  /** Plain-language gloss, used in tooltips. */
  blurb: string;
}

const BLACK_INK = "#0b0b0b";
const WHITE_INK = "#ffffff";

const TARIFF_RAMP = {
  light: ["#86b6ef", "#5598e7", "#2470c9", "#1c5cab", "#0d366b"],
  dark: ["#1a5099", "#2f7fd8", "#5598e7", "#86b6ef", "#b7d3f6"],
} as const;

const TARIFF_INK = {
  light: [BLACK_INK, BLACK_INK, WHITE_INK, WHITE_INK, WHITE_INK],
  dark: [WHITE_INK, BLACK_INK, BLACK_INK, BLACK_INK, BLACK_INK],
} as const;

/**
 * The band edges, in one place. Every surface on the tariff page - the distribution
 * columns, the region bars, the table pills, the band filter - reads them from here.
 * They were previously restated per surface, which is how a band can quietly mean two
 * different things on one page.
 */
const TARIFF_STEPS = [
  { max: 0.5, label: "Duty-free", range: "under 0.5%", blurb: "effectively zero - an agreement or a zero-rated schedule", dutyFree: true },
  { max: 2.5, label: "Low", range: "0.5-2.5%", blurb: "close to open" },
  { max: 5, label: "Moderate", range: "2.5-5%", blurb: "ordinary MFN territory" },
  { max: 10, label: "Elevated", range: "5-10%", blurb: "a real cost on landed price" },
  { max: 15, label: "High", range: "10-15%", blurb: "margin-eating for most goods" },
  { max: Infinity, label: "Very high", range: "over 15%", blurb: "often protective" },
] as const;

/** Mode-free band shape, for server code that only needs edges and labels. */
export const TARIFF_BAND_META = TARIFF_STEPS.map(({ max, label, range, blurb }) => ({
  max,
  label,
  range,
  blurb,
  dutyFree: label === "Duty-free",
}));

export function tariffBands(mode: Mode): TariffBand[] {
  return TARIFF_STEPS.map((step, i) => ({
    max: step.max,
    label: step.label,
    range: step.range,
    blurb: step.blurb,
    // Duty-free sits outside the ramp; the rest take ramp slot i-1.
    color: i === 0 ? STATUS.good : TARIFF_RAMP[mode][i - 1],
    ink: i === 0 ? BLACK_INK : TARIFF_INK[mode][i - 1],
  }));
}

export function tariffBandFor(rate: number, mode: Mode): TariffBand {
  const bands = tariffBands(mode);
  return bands.find((b) => rate < b.max) ?? bands[bands.length - 1];
}
