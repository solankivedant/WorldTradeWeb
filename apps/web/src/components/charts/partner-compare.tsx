"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ChartFrame } from "./chart-frame";
import { CompareBar, CompareLegend, COMPARE_TRACK_PAD } from "./compare-bar";
import { CountryFlag } from "@/components/country-flag";
import { flowColors } from "@/lib/palette";
import { useTheme } from "@/components/theme";
import { usd, usdFull } from "@/lib/format";
import { pairScale, type PartnerPair } from "@/lib/pairing";

/**
 * A list of countries with both directions on one row.
 *
 * Replaces the old pair of cards - "top export destinations" and "top import sources" -
 * where the same partner appeared in both lists at different ranks and the relationship
 * had to be reassembled by eye. One row per country shows the whole relationship: how
 * much goes out, how much comes in, and which way it leans.
 *
 * Two variants, because the same shape answers two different questions and they need
 * different wording:
 *
 *   "corridor" - a reporting country's partners. The green bar is the REPORTER exporting
 *     to the row's country; the red bar is the row's country exporting back. A bare
 *     "Exports" is ambiguous by construction here, because there are two countries in the
 *     row and either could be the one exporting, so every row names the corridor in words
 *     and the row links to that corridor's dashboard.
 *
 *   "country" - countries ranked by their own trade in some sector. There is no second
 *     country in the row, so the bars are simply that country's own exports and imports,
 *     and the row links to that country. Rendering this variant as a corridor list was
 *     the earlier bug: it pointed every row at a corridor with an arbitrary origin, and
 *     the top row linked a country to itself.
 */
export function PartnerCompare({
  rows,
  originIso,
  originName,
  variant = "corridor",
  title = "Top trading partners",
  subtitle,
  limit = 10,
}: {
  rows: PartnerPair[];
  /** The reporting country. Required for the corridor variant, ignored by "country". */
  originIso?: string;
  /** The reporting country's name, so "exports" is never whose-exports. */
  originName?: string;
  variant?: "corridor" | "country";
  title?: string;
  subtitle?: string;
  limit?: number;
}) {
  const { resolved } = useTheme();
  const colors = flowColors(resolved);
  const shown = rows.slice(0, limit);
  const corridor = variant === "corridor" && !!originIso;
  const origin = originName ?? originIso ?? "";

  const scale = pairScale(shown);

  const exportHeading = corridor ? `${origin} exports to partner` : "Country's exports";
  const importHeading = corridor ? `Partner exports to ${origin}` : "Country's imports";

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
        { key: "name", label: corridor ? "Partner" : "Country", render: (r) => r.name },
        { key: "x", label: exportHeading, align: "right", render: (r) => usdFull(r.exports) },
        { key: "m", label: importHeading, align: "right", render: (r) => usdFull(r.imports) },
        { key: "net", label: "Balance", align: "right", render: (r) => usdFull(r.net) },
      ]}
      footnote={
        corridor
          ? "Both figures come from each country's own export report, so the two sides are measured the same way rather than one being a mirror of the other. Ranked by total trade with the partner."
          : "Each country's own reported exports and imports in this sector. Ranked by the two added together, so a country is not promoted by one side alone."
      }
    >
      <CompareLegend
        className={`mb-2.5 ${COMPARE_TRACK_PAD}`}
        exportLabel={corridor ? `${origin} exports to partner` : "Exports (sold abroad)"}
        importLabel={corridor ? `Partner exports to ${origin}` : "Imports (bought in)"}
      />
      <ol className="space-y-3">
        {shown.map((row, i) => {
          const exportLabel = corridor
            ? `${origin} exports to ${row.name}`
            : `${row.name} exports`;
          const importLabel = corridor
            ? `${row.name} exports to ${origin}`
            : `${row.name} imports`;

          return (
            <li key={row.iso3}>
              <Link
                href={corridor ? `/corridor/${originIso}/${row.iso3}` : `/country/${row.iso3}`}
                title={
                  corridor
                    ? `Open the ${origin} - ${row.name} corridor dashboard`
                    : `Open the ${row.name} dashboard`
                }
                className="group block rounded-md py-0.5 transition-colors hover:bg-raised"
              >
                <div
                  className={`mb-1 flex items-center justify-between gap-2 ${COMPARE_TRACK_PAD} text-xs`}
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="tabular w-4 shrink-0 text-ink-muted">{i + 1}</span>
                    <CountryFlag iso2={row.iso2} name={row.name} size="sm" />
                    <span className="truncate text-ink-secondary group-hover:text-ink">
                      {row.name}
                    </span>
                    <ArrowRight
                      className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                      aria-hidden
                    />
                  </span>
                  {row.net !== null && (
                    <span
                      className="tabular shrink-0 text-2xs"
                      style={{ color: row.net >= 0 ? colors.export : colors.import }}
                      title={
                        corridor
                          ? row.net >= 0
                            ? `${origin} sells ${usd(row.net)} more to ${row.name} than it buys from it`
                            : `${origin} buys ${usd(Math.abs(row.net))} more from ${row.name} than it sells to it`
                          : row.net >= 0
                            ? `${row.name} is a net exporter here by ${usd(row.net)}`
                            : `${row.name} is a net importer here by ${usd(Math.abs(row.net))}`
                      }
                    >
                      {row.net >= 0 ? "+" : ""}
                      {usd(row.net, 0)} net
                    </span>
                  )}
                </div>
                <CompareBar
                  exportValue={row.exports}
                  importValue={row.imports}
                  scale={scale}
                  exportLabel={exportLabel}
                  importLabel={importLabel}
                />
              </Link>
            </li>
          );
        })}
      </ol>
    </ChartFrame>
  );
}
