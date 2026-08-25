/**
 * Presentation rules for the context layer.
 *
 * The MEANING of every series - its label, unit, basis, documented range and the
 * sentence explaining it - travels inside `indicators.json` and is never restated here.
 * That is the same rule `codes` follows inside bilateral_sectors.json: a description
 * held apart from its figures drifts, and then every figure is quietly mislabelled.
 *
 * What lives here is only what the published file has no opinion about - how to render
 * a number of a given unit, and which glyph a family wears. Nothing in this module may
 * decide what a figure means.
 */

import {
  Banknote,
  Building2,
  Gauge,
  Landmark,
  Ship,
  Coins,
  type LucideIcon,
} from "lucide-react";

import { usd } from "@/lib/format";
import type { IndicatorSpec } from "@/lib/types";

/** Glyphs only. The label and blurb come from the published file. */
export const FAMILY_ICON: Record<string, LucideIcon> = {
  services: Building2,
  finance: Banknote,
  connectivity: Ship,
  logistics: Gauge,
  governance: Landmark,
  prices: Coins,
};

export function familyIcon(family: string): LucideIcon {
  return FAMILY_ICON[family] ?? Gauge;
}

/**
 * A value rendered in its own unit.
 *
 * Money reuses the app-wide `usd` helper so a services figure and a goods figure are
 * formatted identically - they are different KINDS of fact, but they are both dollars,
 * and formatting them differently would imply a difference of measurement rather than of
 * basis.
 */
export function formatIndicator(value: number, unit: IndicatorSpec["unit"]): string {
  switch (unit) {
    case "usd":
      return usd(value);
    case "teu":
      return value >= 1e6
        ? `${(value / 1e6).toFixed(1)}M TEU`
        : `${Math.round(value / 1e3).toLocaleString("en-US")}K TEU`;
    case "days":
      return `${value.toFixed(value < 10 ? 1 : 0)} days`;
    case "percent":
      return `${value.toFixed(1)}%`;
    case "lcu-per-usd":
      return value >= 100 ? value.toFixed(0) : value.toFixed(2);
    case "index":
    case "score":
      return value.toFixed(2);
    default:
      return String(value);
  }
}

/**
 * Where a value sits on its documented scale, 0-1, or null when it has no scale.
 *
 * Only series with a `range` in the published catalogue get a meter. An unbounded
 * figure - dollars, TEU, days - has no "full", and drawing it against an invented
 * maximum would put a country at 90% of a number nobody published.
 */
export function scalePosition(value: number, spec: IndicatorSpec): number | null {
  if (!spec.range) return null;
  const [lo, hi] = spec.range;
  if (hi === lo) return null;
  return Math.min(1, Math.max(0, (value - lo) / (hi - lo)));
}

/**
 * How a basis reads to someone who did not build the pipeline.
 *
 * This is the field that stops a services figure being read as a customs figure, so it
 * is spelled out in words on the page rather than left as a slug.
 */
export const BASIS_LABEL: Record<string, string> = {
  "balance-of-payments": "Balance of payments",
  survey: "Survey of forwarders",
  "composite-index": "Composite index",
  "unctad-index": "UNCTAD index",
  "port-statistics": "Port statistics",
  "national-accounts": "National accounts",
};

export function basisLabel(basis: string): string {
  return BASIS_LABEL[basis] ?? basis;
}

/**
 * Rank phrased so it survives the direction of the scale.
 *
 * Rank is computed on the RAW value, highest first. For a series where low is good -
 * lead times - "12th of 194" would read as praise, so the wording is flipped.
 *
 * And where the catalogue does not say which direction is good, there is NO rank. An
 * inflation rank reads as a league table whichever way it is worded, and "53rd of 193"
 * silently asserts that more inflation is a better placing. A position nobody can
 * interpret is not a fact worth printing.
 */
export function rankLabel(
  rank: number | null,
  reporting: number,
  higherIsBetter: boolean | null | undefined,
): string | null {
  if (rank === null || reporting === 0) return null;
  if (higherIsBetter === null || higherIsBetter === undefined) return null;
  if (higherIsBetter === false) {
    const fromBottom = reporting - rank + 1;
    return `${ordinal(fromBottom)} shortest of ${reporting}`;
  }
  return `${ordinal(rank)} of ${reporting}`;
}

function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
