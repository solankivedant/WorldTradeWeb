"use client";

import Link from "next/link";
import { ChartFrame } from "./chart-frame";
import { sectorColor } from "@/lib/palette";
import { SectorIcon } from "@/components/sector-icon";
import { useTheme } from "@/components/theme";
import { pct, usd, usdFull } from "@/lib/format";
import type { GapRow } from "@/lib/types";

/**
 * Corridor gap analysis: sectors the destination buys heavily from the world, where the
 * origin is already a capable exporter.
 *
 * This is deliberately NOT presented as "the origin should export X here." We can see
 * that demand exists and that capability exists; we cannot see whether the origin
 * already serves this demand through the corridor, because the source does not publish
 * partner-by-product at this tier. The framing stays at what the data supports.
 */
export function GapTable({
  rows,
  originName,
  originIso,
  destinationName,
}: {
  rows: GapRow[];
  originName: string;
  originIso: string;
  destinationName: string;
}) {
  const { resolved } = useTheme();
  if (!rows.length) {
    return (
      <ChartFrame
        title="Sector overlap"
        subtitle={`Where ${originName}'s exports meet ${destinationName}'s imports`}
        rows={[]}
        columns={[]}
      >
        <div className="flex h-[140px] items-center justify-center px-6 text-center text-sm text-ink-muted">
          No sector where both countries are large enough for a meaningful comparison.
        </div>
      </ChartFrame>
    );
  }

  const maxImports = Math.max(...rows.map((r) => r.destinationImports));

  return (
    <ChartFrame
      title="Sector overlap"
      subtitle={`Sectors ${destinationName} imports heavily and ${originName} exports competitively`}
      rows={rows}
      columns={[
        { key: "name", label: "Sector", render: (r) => r.name },
        {
          key: "d",
          label: `${destinationName} imports`,
          align: "right",
          render: (r) => usdFull(r.destinationImports),
        },
        {
          key: "o",
          label: `${originName} exports`,
          align: "right",
          render: (r) => usdFull(r.originExports),
        },
        {
          key: "s",
          label: "Share of origin exports",
          align: "right",
          render: (r) => pct(r.originWorldShare),
        },
      ]}
      footnote={`Both figures are world totals, not corridor figures - the source does not publish partner-by-product detail at this tier. Overlap means demand and capability coexist; it does not by itself mean the demand is unmet.`}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-xs">
          <thead>
            <tr className="border-b border-hairline text-ink-muted">
              <th scope="col" className="px-2 py-1.5 text-left font-medium">
                Sector
              </th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">
                {destinationName} buys
              </th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">
                {originName} sells
              </th>
              <th scope="col" className="w-[34%] px-2 py-1.5 text-left font-medium">
                Relative demand
              </th>
            </tr>
          </thead>
          <tbody className="tabular">
            {rows.map((row) => (
              <tr key={row.code} className="border-b border-hairline/50 last:border-0">
                <td className="px-2 py-2">
                  <Link
                    href={`/product/${encodeURIComponent(row.code)}`}
                    className="flex items-center gap-2 hover:underline"
                  >
                    <SectorIcon code={row.code} className="h-3.5 w-3.5" />
                    <span className="text-ink-secondary">{row.name}</span>
                  </Link>
                </td>
                <td className="px-2 py-2 text-right text-ink">{usd(row.destinationImports)}</td>
                <td className="px-2 py-2 text-right text-ink-secondary">
                  {usd(row.originExports)}
                </td>
                <td className="px-2 py-2">
                  <div className="h-1.5 w-full overflow-hidden rounded-sm bg-hairline/60">
                    <div
                      className="h-full rounded-sm"
                      style={{
                        width: `${Math.max((row.destinationImports / maxImports) * 100, 2)}%`,
                        background: sectorColor(row.code, resolved),
                      }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 border-t border-hairline pt-2.5">
        <Link
          href={`/opportunities?origin=${originIso}`}
          className="text-xs text-series-1 hover:underline"
        >
          Score these against every market →
        </Link>
      </div>
    </ChartFrame>
  );
}
