"use client";

import { AlertTriangle } from "lucide-react";
import { ChartFrame } from "./chart-frame";
import { series } from "@/lib/palette";
import { useTheme } from "@/components/theme";
import { usd, usdFull } from "@/lib/format";

/**
 * The mirror-flow comparison.
 *
 * Country A's reported exports to B and B's reported imports from A describe the same
 * physical goods, and routinely differ by 10% or more - CIF vs FOB valuation, shipments
 * counted in different years, transshipment through a third country, and re-export
 * treatment all drive a wedge between them.
 *
 * The temptation is to average them or silently prefer one. Both destroy information.
 * This component shows both figures side by side and names the gap, because a user who
 * knows the two sources disagree can reason about it; a user handed one averaged number
 * cannot.
 */
export function MirrorCompare({
  originName,
  destinationName,
  originReported,
  destinationReported,
  gapPct,
}: {
  originName: string;
  destinationName: string;
  originReported: number | null;
  destinationReported: number | null;
  gapPct: number | null;
}) {
  const { resolved } = useTheme();
  const S = series(resolved);
  const rows = [
    { source: `${originName} (exporter)`, label: "Reported exports", value: originReported },
    {
      source: `${destinationName} (importer)`,
      label: "Reported imports",
      value: destinationReported,
    },
  ];

  const max = Math.max(originReported ?? 0, destinationReported ?? 0, 1);
  const material = gapPct !== null && Math.abs(gapPct) >= 10;

  return (
    <ChartFrame
      title="Both sides of the same trade"
      subtitle={`What each country reports for ${originName} → ${destinationName}`}
      rows={rows}
      columns={[
        { key: "source", label: "Reporter", render: (r) => r.source },
        { key: "label", label: "Figure", render: (r) => r.label },
        { key: "value", label: "Value", align: "right", render: (r) => usdFull(r.value) },
      ]}
      legend={[
        { color: S[0], label: `${originName} reports` },
        { color: S[1], label: `${destinationName} reports` },
      ]}
      footnote="Exporter and importer figures for the same trade rarely match. Valuation basis (CIF vs FOB), timing, transshipment and re-export treatment all contribute. Neither figure is corrected against the other here."
    >
      <div className="space-y-3">
        {rows.map((row, i) => (
          <div key={row.source}>
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="text-ink-secondary">{row.source}</span>
              <span className="tabular text-ink">{usd(row.value)}</span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-sm bg-hairline/60">
              <div
                className="h-full rounded-sm"
                style={{
                  width: row.value === null ? "0%" : `${Math.max((row.value / max) * 100, 1.5)}%`,
                  background: S[i],
                }}
              />
            </div>
            {row.value === null && (
              <p className="mt-0.5 text-2xs text-ink-muted">Not reported by this country.</p>
            )}
          </div>
        ))}

        {gapPct !== null && (
          <div
            className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs leading-relaxed ${
              material
                ? "border-status-warning/30 bg-status-warning/5"
                : "border-hairline bg-plane/40"
            }`}
          >
            {material && (
              <AlertTriangle
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-warning"
                aria-hidden
              />
            )}
            <span className="text-ink-secondary">
              {destinationName} reports{" "}
              <span className={`tabular ${material ? "text-status-warning" : "text-ink"}`}>
                {gapPct > 0 ? "+" : ""}
                {gapPct.toFixed(1)}%
              </span>{" "}
              {gapPct > 0 ? "more" : "less"} than {originName} does.{" "}
              {material
                ? "That is a material discrepancy - treat the corridor value as a range, not a point."
                : "That is within the range normally explained by valuation and timing."}
            </span>
          </div>
        )}
      </div>
    </ChartFrame>
  );
}
