"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ChartFrame } from "./chart-frame";
import { CompareBar, CompareLegend } from "./compare-bar";
import { flowColors } from "@/lib/palette";
import { useTheme } from "@/components/theme";
import { usd, usdFull } from "@/lib/format";
import { pairScale, type SectorPair } from "@/lib/pairing";

/**
 * Trade by sector, both directions against one centre line.
 *
 * This replaces what used to be two separate cards - "top export sectors" and "top import
 * sectors" - which forced the reader to hold one list in their head while scanning the
 * other, and never lined up the same sector on both sides. Here a sector is one row and
 * the surplus or deficit in it is visible as the difference in bar length.
 */
export function SectorCompare({
  rows,
  title = "Trade by sector",
  subtitle,
  limit = 10,
}: {
  rows: SectorPair[];
  title?: string;
  subtitle?: string;
  limit?: number;
}) {
  const { resolved } = useTheme();
  const colors = flowColors(resolved);
  const shown = rows.slice(0, limit);

  const scale = pairScale(shown);

  if (!rows.length) {
    return (
      <ChartFrame title={title} subtitle={subtitle} rows={[]} columns={[]}>
        <div className="flex h-[240px] items-center justify-center text-sm text-ink-muted">
          No sector breakdown reported.
        </div>
      </ChartFrame>
    );
  }

  return (
    <ChartFrame
      title={title}
      subtitle={subtitle}
      rows={rows}
      columns={[
        { key: "name", label: "Sector", render: (r) => r.name },
        { key: "x", label: "Exports", align: "right", render: (r) => usdFull(r.exports) },
        { key: "m", label: "Imports", align: "right", render: (r) => usdFull(r.imports) },
        { key: "net", label: "Net", align: "right", render: (r) => usdFull(r.net) },
      ]}
      footnote="Bars share one scale, so length is comparable across sectors as well as between the two directions. A sector reporting only one side shows a single bar."
    >
      <CompareLegend className="mb-2.5 px-12" />
      <ul className="space-y-3">
        {shown.map((row) => (
          <li key={row.code}>
            <div className="mb-1 flex items-baseline justify-between gap-2 px-12 text-xs">
              <Link
                href={`/product/${encodeURIComponent(row.code)}`}
                className="group flex min-w-0 items-center gap-1 truncate text-ink-secondary hover:text-ink"
              >
                <span className="truncate">{row.name}</span>
                <ChevronRight
                  className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                  aria-hidden
                />
              </Link>
              {row.net !== null && (
                <span
                  className="tabular shrink-0 text-2xs"
                  style={{ color: row.net >= 0 ? colors.export : colors.import }}
                  title={
                    row.net >= 0 ? "Net exporter in this sector" : "Net importer in this sector"
                  }
                >
                  {row.net >= 0 ? "+" : ""}
                  {usd(row.net, 0)} net
                </span>
              )}
            </div>
            <CompareBar exportValue={row.exports} importValue={row.imports} scale={scale} />
          </li>
        ))}
      </ul>
    </ChartFrame>
  );
}
