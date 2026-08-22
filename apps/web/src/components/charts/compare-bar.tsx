"use client";

import { flowColors } from "@/lib/palette";
import { useTheme } from "@/components/theme";
import { usd } from "@/lib/format";

/**
 * Exports and imports drawn against a shared centre line.
 *
 * The whole point of this component is that neither figure appears without the other.
 * Trade data invites a bad reading when the two are split across separate views or
 * separate cards: a big export number looks like success until you see the import number
 * beside it. Anchoring both to one centre makes the comparison the default reading, and
 * the balance visible as the difference in bar length before anyone reads a digit.
 *
 * Values sit INLINE at the ends of their own bar, not on a line underneath. Underneath,
 * they end up nearer the next row's label than their own bar, and readers attach them to
 * the wrong sector.
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
}: {
  exportValue: number | null;
  importValue: number | null;
  scale: number;
  showValues?: boolean;
  height?: number;
}) {
  const { resolved } = useTheme();
  const colors = flowColors(resolved);
  const safe = scale > 0 ? scale : 1;

  const exportPct = exportValue === null ? 0 : Math.min(100, (exportValue / safe) * 100);
  const importPct = importValue === null ? 0 : Math.min(100, (importValue / safe) * 100);

  return (
    <div className="flex items-center gap-2">
      {showValues && (
        <span
          className="tabular w-12 shrink-0 text-right text-2xs"
          style={{ color: exportValue === null ? undefined : colors.export }}
        >
          {exportValue === null ? <span className="text-ink-muted">-</span> : usd(exportValue, 0)}
        </span>
      )}

      <div className="flex min-w-0 flex-1 items-stretch" style={{ height }}>
        {/* Exports grow leftward from the centre, imports rightward. */}
        <div className="flex flex-1 justify-end overflow-hidden rounded-l-full bg-hairline/70">
          <div
            className="rounded-l-full"
            style={{ width: `${exportPct}%`, background: colors.export }}
          />
        </div>
        <div className="w-px shrink-0 bg-baseline" aria-hidden />
        <div className="flex flex-1 overflow-hidden rounded-r-full bg-hairline/70">
          <div
            className="rounded-r-full"
            style={{ width: `${importPct}%`, background: colors.import }}
          />
        </div>
      </div>

      {showValues && (
        <span
          className="tabular w-12 shrink-0 text-2xs"
          style={{ color: importValue === null ? undefined : colors.import }}
        >
          {importValue === null ? <span className="text-ink-muted">-</span> : usd(importValue, 0)}
        </span>
      )}
    </div>
  );
}

/** The out/in key. Sits above any list of CompareBars so the sides are never ambiguous. */
export function CompareLegend({ className = "" }: { className?: string }) {
  const { resolved } = useTheme();
  const colors = flowColors(resolved);
  return (
    <div className={`flex items-center justify-between text-2xs ${className}`}>
      <span className="flex items-center gap-1.5" style={{ color: colors.export }}>
        <span className="h-2 w-2 rounded-sm" style={{ background: colors.export }} aria-hidden />
        Exports
      </span>
      <span className="flex items-center gap-1.5" style={{ color: colors.import }}>
        Imports
        <span className="h-2 w-2 rounded-sm" style={{ background: colors.import }} aria-hidden />
      </span>
    </div>
  );
}
