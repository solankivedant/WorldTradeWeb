"use client";

import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { flowColors } from "@/lib/palette";
import { useTheme } from "@/components/theme";
import { usd } from "@/lib/format";

/**
 * Horizontal padding that lines a row's own header up with the bar TRACK rather than the
 * value gutters. Kept next to the gutter width it is derived from (w-[4.5rem] + gap-1.5),
 * because the two silently drift apart otherwise and every list goes subtly crooked.
 */
export const COMPARE_TRACK_PAD = "px-[4.875rem]";

/**
 * Exports and imports drawn against a shared centre line.
 *
 * The whole point of this component is that neither figure appears without the other.
 * Trade data invites a bad reading when the two are split across separate views or
 * separate cards: a big export number looks like success until you see the import number
 * beside it. Anchoring both to one centre makes the comparison the default reading, and
 * the balance visible as the difference in bar length before anyone reads a digit.
 *
 * Direction is repeated on EVERY row, not stated once in the legend. A legend above ten
 * rows is off-screen by the time the reader is looking at row eight, and colour alone was
 * doing all the work - which failed for exactly the reason the palette notes warn about.
 * So each value carries the same arrow the KPI row uses (out of a line / into a line),
 * and each half of the track names the direction in full on hover and to a screen reader.
 *
 * Values sit at fixed columns rather than at the tip of their own bar. A tip-anchored
 * label tracks the bar but stops forming a scannable column, and short bars collide with
 * the centre line.
 *
 * Scale is passed in rather than derived, so every row in a list shares one - scaling each
 * row to its own maximum would make a $2B row look like a $200B row.
 */
export function CompareBar({
  exportValue,
  importValue,
  scale,
  showValues = true,
  height = 8,
  exportLabel = "Exports",
  importLabel = "Imports",
}: {
  exportValue: number | null;
  importValue: number | null;
  scale: number;
  showValues?: boolean;
  height?: number;
  /** Full wording for the outbound side, e.g. "India exports to China". */
  exportLabel?: string;
  /** Full wording for the inbound side, e.g. "China exports to India". */
  importLabel?: string;
}) {
  const { resolved } = useTheme();
  const colors = flowColors(resolved);
  const safe = scale > 0 ? scale : 1;

  const exportPct = exportValue === null ? 0 : Math.min(100, (exportValue / safe) * 100);
  const importPct = importValue === null ? 0 : Math.min(100, (importValue / safe) * 100);

  const exportTitle = `${exportLabel}: ${exportValue === null ? "not reported" : usd(exportValue)}`;
  const importTitle = `${importLabel}: ${importValue === null ? "not reported" : usd(importValue)}`;

  return (
    <div className="flex items-center gap-1.5" role="img" aria-label={`${exportTitle}. ${importTitle}.`}>
      {showValues && (
        <span
          className="tabular flex w-[4.5rem] shrink-0 items-center justify-end gap-0.5 text-2xs"
          style={{ color: exportValue === null ? undefined : colors.export }}
          title={exportTitle}
        >
          <ArrowUpFromLine className="h-2.5 w-2.5 shrink-0" aria-hidden />
          {exportValue === null ? <span className="text-ink-muted">-</span> : usd(exportValue, 0)}
        </span>
      )}

      <div className="flex min-w-0 flex-1 items-stretch" style={{ height }}>
        {/* Exports grow leftward from the centre, imports rightward. */}
        <div
          className="flex flex-1 justify-end overflow-hidden rounded-l-full bg-hairline/70"
          title={exportTitle}
        >
          <div
            className="rounded-l-full"
            style={{ width: `${exportPct}%`, background: colors.export }}
          />
        </div>
        <div className="w-px shrink-0 bg-baseline" aria-hidden />
        <div
          className="flex flex-1 overflow-hidden rounded-r-full bg-hairline/70"
          title={importTitle}
        >
          <div
            className="rounded-r-full"
            style={{ width: `${importPct}%`, background: colors.import }}
          />
        </div>
      </div>

      {showValues && (
        <span
          className="tabular flex w-[4.5rem] shrink-0 items-center gap-0.5 text-2xs"
          style={{ color: importValue === null ? undefined : colors.import }}
          title={importTitle}
        >
          <ArrowDownToLine className="h-2.5 w-2.5 shrink-0" aria-hidden />
          {importValue === null ? <span className="text-ink-muted">-</span> : usd(importValue, 0)}
        </span>
      )}
    </div>
  );
}

/**
 * The out/in key. Sits above any list of CompareBars so the sides are never ambiguous.
 *
 * Callers pass wording that names the reporting country ("India exports" rather than
 * "Exports"), because on a partner list every row has two countries in it and a bare
 * "Exports" does not say whose.
 */
export function CompareLegend({
  className = "",
  exportLabel = "Exports",
  importLabel = "Imports",
}: {
  className?: string;
  exportLabel?: string;
  importLabel?: string;
}) {
  const { resolved } = useTheme();
  const colors = flowColors(resolved);
  return (
    <div className={`flex items-center justify-between gap-2 text-2xs ${className}`}>
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: colors.export }} aria-hidden />
        <ArrowUpFromLine className="h-2.5 w-2.5 shrink-0" style={{ color: colors.export }} aria-hidden />
        <span className="truncate font-medium text-ink-secondary">{exportLabel}</span>
      </span>
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="truncate font-medium text-ink-secondary">{importLabel}</span>
        <ArrowDownToLine className="h-2.5 w-2.5 shrink-0" style={{ color: colors.import }} aria-hidden />
        <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: colors.import }} aria-hidden />
      </span>
    </div>
  );
}
