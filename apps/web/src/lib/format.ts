/**
 * Formatting. Values live in state as raw USD numbers and are formatted only here,
 * at render time (see .claude/rules/code-style.md).
 */

/** Compact USD: $1.2T, $384B, $12.5M. The default for anything on a chart or tile. */
export function usd(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  const sign = value < 0 ? "-" : "";
  const v = Math.abs(value);
  if (v >= 1e12) return `${sign}$${(v / 1e12).toFixed(decimals)}T`;
  if (v >= 1e9) return `${sign}$${(v / 1e9).toFixed(decimals)}B`;
  if (v >= 1e6) return `${sign}$${(v / 1e6).toFixed(decimals)}M`;
  if (v >= 1e3) return `${sign}$${(v / 1e3).toFixed(0)}K`;
  return `${sign}$${v.toFixed(0)}`;
}

/** Full precision, for tables and tooltips where the exact figure matters. */
export function usdFull(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function pct(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return `${value.toFixed(decimals)}%`;
}

/** Signed percentage for year-over-year deltas. */
export function delta(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(decimals)}%`;
}

export function growth(current?: number | null, previous?: number | null): number | null {
  if (!current || !previous || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

/** Compound annual growth rate over `years` periods, as a percentage. */
export function cagr(first?: number | null, last?: number | null, years?: number): number | null {
  if (!first || !last || !years || years <= 0 || first <= 0) return null;
  return (Math.pow(last / first, 1 / years) - 1) * 100;
}

export function share(part?: number | null, whole?: number | null): number | null {
  if (part === null || part === undefined || !whole || whole === 0) return null;
  return (part / whole) * 100;
}

export function flagEmoji(iso2: string | null | undefined): string {
  if (!iso2 || iso2.length !== 2) return "🏳";
  const cp = [...iso2.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65);
  return String.fromCodePoint(...cp);
}
