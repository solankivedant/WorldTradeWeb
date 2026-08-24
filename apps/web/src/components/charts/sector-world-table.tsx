"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQueryState } from "nuqs";
import { ArrowUpDown } from "lucide-react";
import { startRouteProgress } from "@/lib/nav-progress";
import { useTheme } from "@/components/theme";
import { sectorColor } from "@/lib/palette";
import { sectorInfo } from "@/lib/sectors";
import { SectorIcon } from "@/components/sector-icon";
import { usd } from "@/lib/format";
import type { SectorOverview } from "@/lib/types";

/**
 * Every sector, side by side, with world trade as bar length.
 *
 * This is the "irrespective of connection" view: it is the whole world's trade in each
 * HS section group, not one country's and not one corridor's. Bar length carries the
 * magnitude because that is the comparison people read most accurately across sixteen
 * rows; the sector's own colour is the identity channel and is the SAME hue the sector
 * wears on the map and in every chart, so the mapping is learned once.
 *
 * Concentration ships alongside size on purpose. A $2.7T sector supplied by four
 * countries and a $2.7T sector supplied by ninety are completely different propositions,
 * and size alone cannot tell them apart.
 */

type Sort = "trade" | "corridors" | "hhi" | "name";

export function SectorWorldTable({ rows }: { rows: SectorOverview[] }) {
  const { resolved } = useTheme();
  const [sort, setSort] = useState<Sort>("trade");
  // The row click writes the same `sector` param the filter bar owns, so clicking a row
  // and picking from the dropdown are the same action and cannot disagree.
  const [selected, setSelected] = useQueryState("sector", {
    defaultValue: "",
    shallow: false,
  });
  const onSelect = (code: string) => {
    startRouteProgress();
    setSelected(code);
  };

  const sorted = useMemo(() => {
    const list = [...rows];
    if (sort === "trade") list.sort((a, b) => b.worldTrade - a.worldTrade);
    else if (sort === "corridors") list.sort((a, b) => b.corridors - a.corridors);
    else if (sort === "hhi") list.sort((a, b) => (b.hhi ?? 0) - (a.hhi ?? 0));
    else list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [rows, sort]);

  const max = Math.max(...rows.map((r) => r.worldTrade), 1);

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-2.5">
        <div className="min-w-0">
          <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">
            World trade by sector
          </h2>
          <p className="mt-0.5 text-xs text-ink-secondary">
            Every corridor on earth, summed per sector · click a row to filter this page
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-1.5 text-2xs text-ink-muted">
          <ArrowUpDown className="h-3 w-3" aria-hidden />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            aria-label="Sort sectors"
            className="h-7 rounded-md border border-hairline bg-plane px-1.5 text-xs text-ink focus:border-series-1 focus:outline-none"
          >
            <option value="trade">World trade</option>
            <option value="corridors">Corridor count</option>
            <option value="hhi">Concentration</option>
            <option value="name">Name</option>
          </select>
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-xs">
          <caption className="sr-only">
            World trade, corridor count and supplier concentration for each HS section
            group
          </caption>
          <thead>
            <tr className="border-b border-hairline text-ink-muted">
              <th scope="col" className="px-3 py-2 text-left font-medium">
                Sector
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                World trade
              </th>
              <th scope="col" className="w-1/4 px-3 py-2 text-left font-medium">
                Relative size
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Corridors
              </th>
              <th scope="col" className="px-3 py-2 text-left font-medium">
                Biggest seller
              </th>
              <th scope="col" className="px-3 py-2 text-left font-medium">
                Biggest buyer
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Supplier spread
              </th>
            </tr>
          </thead>
          <tbody className="tabular">
            {sorted.map((row) => {
              const hue = sectorColor(row.code, resolved);
              const info = sectorInfo(row.code);
              const on = selected === row.code;
              return (
                <tr
                  key={row.code}
                  onClick={() => onSelect(on ? "" : row.code)}
                  className={`cursor-pointer border-b border-hairline/50 transition-colors last:border-0 hover:bg-raised/60 ${
                    on ? "bg-series-1/10" : ""
                  }`}
                >
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-2">
                      <SectorIcon code={row.code} className="h-3.5 w-3.5" />
                      <Link
                        href={`/product/${encodeURIComponent(row.code)}`}
                        onClick={(e) => e.stopPropagation()}
                        // The contents ride in the tooltip rather than the cell: sixteen
                        // rows of "includes gold, diamonds, jewellery..." would bury the
                        // figures the table exists to show.
                        title={info ? `HS ${info.hs}. Includes ${info.covers.toLowerCase()}.` : undefined}
                        className="text-ink-secondary hover:text-ink hover:underline"
                      >
                        {row.name}
                      </Link>
                      {info && (
                        <span className="tabular shrink-0 text-2xs text-ink-muted">
                          HS {info.hs}
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-ink">
                    {usd(row.worldTrade)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="h-2 w-full overflow-hidden rounded-sm bg-raised">
                      <div
                        className="h-full rounded-sm"
                        style={{
                          width: `${Math.max(1.5, (row.worldTrade / max) * 100)}%`,
                          background: hue,
                        }}
                      />
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right text-ink-secondary">
                    {row.corridors.toLocaleString("en-US")}
                  </td>
                  <td className="px-3 py-2 text-ink-secondary">
                    {row.topExporter ? (
                      <span>
                        {row.topExporter.iso}{" "}
                        <span className="text-ink-muted">{usd(row.topExporter.value, 0)}</span>
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-3 py-2 text-ink-secondary">
                    {row.topImporter ? (
                      <span>
                        {row.topImporter.iso}{" "}
                        <span className="text-ink-muted">{usd(row.topImporter.value, 0)}</span>
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Spread hhi={row.hhi} exporters={row.exporters} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="border-t border-hairline px-4 py-2 text-2xs leading-relaxed text-ink-muted">
        Summed from each exporter&apos;s own report, falling back to the buyer&apos;s report
        only for countries that publish nothing. These are sums of what reporting countries
        declare, not an authoritative world figure - economies that do not report are absent
        rather than estimated.
      </p>
    </div>
  );
}

/**
 * Supplier spread, worded rather than left as a bare HHI.
 *
 * "2,150" means nothing to most readers; "few suppliers" does. The number is kept beside
 * it for anyone who does read HHI, and the thresholds are the conventional
 * competitive / moderate / concentrated cuts used on the product page.
 */
function Spread({ hhi, exporters }: { hhi: number | null; exporters: number }) {
  if (hhi === null) return <span className="text-ink-muted">-</span>;
  const label = hhi > 2500 ? "few suppliers" : hhi > 1500 ? "moderate" : "many suppliers";
  const tone =
    hhi > 2500 ? "text-status-serious" : hhi > 1500 ? "text-status-warning" : "text-ink-secondary";
  return (
    <span
      className={tone}
      title={`Herfindahl-Hirschman index ${Math.round(hhi).toLocaleString("en-US")} across ${exporters} reporting exporters`}
    >
      {label}
    </span>
  );
}
