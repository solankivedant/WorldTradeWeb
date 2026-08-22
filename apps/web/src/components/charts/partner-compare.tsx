"use client";

import Link from "next/link";
import { ChartFrame } from "./chart-frame";
import { CompareBar, CompareLegend } from "./compare-bar";
import { flowColors } from "@/lib/palette";
import { useTheme } from "@/components/theme";
import { flagEmoji, usd, usdFull } from "@/lib/format";
import { pairScale, type PartnerPair } from "@/lib/pairing";

/**
 * Top partners, both directions on one row.
 *
 * Replaces the old pair of cards - "top export destinations" and "top import sources" -
 * where the same partner appeared in both lists at different ranks and the relationship
 * had to be reassembled by eye. One row per partner shows the whole relationship: how
 * much goes out, how much comes in, and which way it leans.
 */
export function PartnerCompare({
  rows,
  originIso,
  title = "Top trading partners",
  subtitle,
  limit = 10,
}: {
  rows: PartnerPair[];
  originIso: string;
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
          No partner detail reported.
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
        { key: "name", label: "Partner", render: (r) => r.name },
        { key: "x", label: "Exports to", align: "right", render: (r) => usdFull(r.exports) },
        { key: "m", label: "Imports from", align: "right", render: (r) => usdFull(r.imports) },
        { key: "net", label: "Balance", align: "right", render: (r) => usdFull(r.net) },
      ]}
      footnote="Both figures come from each country's own export report, so the two sides are measured the same way rather than one being a mirror of the other. Ranked by total trade with the partner."
    >
      <CompareLegend className="mb-2.5 px-12" />
      <ol className="space-y-3">
        {shown.map((row, i) => (
          <li key={row.iso3}>
            <Link
              href={`/corridor/${originIso}/${row.iso3}`}
              className="group block rounded-md py-0.5 transition-colors hover:bg-raised"
            >
              <div className="mb-1 flex items-baseline justify-between gap-2 px-12 text-xs">
                <span className="flex min-w-0 items-baseline gap-1.5">
                  <span className="tabular w-4 shrink-0 text-ink-muted">{i + 1}</span>
                  <span aria-hidden>{flagEmoji(row.iso2)}</span>
                  <span className="truncate text-ink-secondary group-hover:text-ink">
                    {row.name}
                  </span>
                </span>
                {row.net !== null && (
                  <span
                    className="tabular shrink-0 text-2xs"
                    style={{ color: row.net >= 0 ? colors.export : colors.import }}
                    title={
                      row.net >= 0 ? "Surplus with this partner" : "Deficit with this partner"
                    }
                  >
                    {row.net >= 0 ? "+" : ""}
                    {usd(row.net, 0)} net
                  </span>
                )}
              </div>
              <CompareBar exportValue={row.exports} importValue={row.imports} scale={scale} />
            </Link>
          </li>
        ))}
      </ol>
    </ChartFrame>
  );
}
