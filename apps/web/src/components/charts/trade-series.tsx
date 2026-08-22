"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartFrame, TooltipShell } from "./chart-frame";
import { flowColors, ink } from "@/lib/palette";
import { useTheme } from "@/components/theme";
import { usd, usdFull } from "@/lib/format";

export interface SeriesPoint {
  year: number;
  exports: number | null;
  imports: number | null;
}

/**
 * Exports and imports over time. Two series on ONE axis - both are USD, so a second
 * y-scale would be both unnecessary and the single most common charting mistake.
 */
export function TradeSeries({
  data,
  title = "Trade over time",
  subtitle,
}: {
  data: SeriesPoint[];
  title?: string;
  subtitle?: string;
}) {
  const { resolved } = useTheme();
  // Same green/red as the map flows and every compare bar. Exports and imports carry one
  // colour identity across the whole product; a chart using a different pair here would
  // make the reader relearn the encoding on every screen.
  const flow = flowColors(resolved);
  const S = [flow.export, flow.import];
  const INK = ink(resolved);
  const legend = [
    { color: S[0], label: "Exports" },
    { color: S[1], label: "Imports" },
  ];

  if (data.length < 2) {
    return (
      <ChartFrame title={title} subtitle={subtitle} rows={[]} columns={[]} legend={legend}>
        <div className="flex h-[260px] items-center justify-center text-sm text-ink-muted">
          Not enough reported years to draw a trend.
        </div>
      </ChartFrame>
    );
  }

  return (
    <ChartFrame
      title={title}
      subtitle={subtitle}
      legend={legend}
      rows={data}
      columns={[
        { key: "year", label: "Year", render: (r) => r.year },
        { key: "x", label: "Exports", align: "right", render: (r) => usdFull(r.exports) },
        { key: "m", label: "Imports", align: "right", render: (r) => usdFull(r.imports) },
        {
          key: "bal",
          label: "Balance",
          align: "right",
          render: (r) =>
            r.exports !== null && r.imports !== null ? usdFull(r.exports - r.imports) : "-",
        },
      ]}
    >
      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
            <defs>
              <linearGradient id={`gx-${resolved}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={S[0]} stopOpacity={0.28} />
                <stop offset="100%" stopColor={S[0]} stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id={`gm-${resolved}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={S[1]} stopOpacity={0.22} />
                <stop offset="100%" stopColor={S[1]} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={INK.grid} strokeDasharray="0" vertical={false} />
            <XAxis
              dataKey="year"
              tick={{ fill: INK.muted, fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: INK.axis }}
              minTickGap={16}
            />
            <YAxis
              tickFormatter={(v) => usd(v, 0)}
              tick={{ fill: INK.muted, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={52}
            />
            <Tooltip
              cursor={{ stroke: INK.axis, strokeWidth: 1 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const point = payload[0].payload as SeriesPoint;
                const balance =
                  point.exports !== null && point.imports !== null
                    ? point.exports - point.imports
                    : null;
                return (
                  <TooltipShell>
                    <div className="mb-1 font-medium text-ink">{label}</div>
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-sm" style={{ background: S[0] }} />
                      <span className="text-ink-secondary">Exports</span>
                      <span className="ml-auto pl-3 text-ink">{usd(point.exports)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-sm" style={{ background: S[1] }} />
                      <span className="text-ink-secondary">Imports</span>
                      <span className="ml-auto pl-3 text-ink">{usd(point.imports)}</span>
                    </div>
                    {balance !== null && (
                      <div className="mt-1 border-t border-hairline pt-1 text-ink-secondary">
                        Balance{" "}
                        <span className={balance >= 0 ? "text-delta-up" : "text-delta-down"}>
                          {usd(balance)}
                        </span>
                      </div>
                    )}
                  </TooltipShell>
                );
              }}
            />
            <Area
              type="monotone"
              dataKey="exports"
              stroke={S[0]}
              strokeWidth={2}
              fill={`url(#gx-${resolved})`}
              connectNulls={false}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: INK.surface }}
            />
            <Area
              type="monotone"
              dataKey="imports"
              stroke={S[1]}
              strokeWidth={2}
              fill={`url(#gm-${resolved})`}
              connectNulls={false}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: INK.surface }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}
