"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, Search } from "lucide-react";
import { CountryFlag } from "@/components/country-flag";
import { useTheme } from "@/components/theme";
import { flowColors } from "@/lib/palette";
import { usd } from "@/lib/format";
import type { CorridorRow } from "@/lib/types";

/**
 * Ranked corridors under whatever filters are set.
 *
 * A row is DIRECTED: seller on the left, buyer on the right, arrow between them. A
 * corridor table that showed "IND - CHN $16B" would be ambiguous in exactly the way the
 * rest of this app works to avoid, because the reverse direction is $118B and the reader
 * has no way to tell which one they are looking at.
 *
 * The search box filters client-side over the rows already on screen. Anything that would
 * change WHICH rows the server sends - sector, country, region, size - lives in the URL
 * filter bar instead, because those need the full cube.
 */
export function CorridorTable({
  rows,
  total,
  names,
  iso2,
  sectorName,
}: {
  rows: CorridorRow[];
  /** How many corridors matched before the display limit, so the cut is visible. */
  total: number;
  names: Record<string, string>;
  iso2: Record<string, string | null>;
  /** Set when a sector filter is active, so the header says what these values measure. */
  sectorName: string | null;
}) {
  const { resolved } = useTheme();
  const colors = flowColors(resolved);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const a = (names[r.reporter] ?? r.reporter).toLowerCase();
      const b = (names[r.partner] ?? r.partner).toLowerCase();
      return (
        a.includes(q) ||
        b.includes(q) ||
        r.reporter.toLowerCase().startsWith(q) ||
        r.partner.toLowerCase().startsWith(q)
      );
    });
  }, [rows, query, names]);

  const max = Math.max(...rows.map((r) => r.value), 1);

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-4 py-2.5">
        <div className="min-w-0">
          <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">
            Biggest connections
          </h2>
          <p className="mt-0.5 text-xs text-ink-secondary">
            {sectorName ? `${sectorName} only` : "All sectors combined"} · one row per
            direction, seller first
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted"
              aria-hidden
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a country in this list..."
              className="h-8 w-56 rounded-md border border-hairline bg-plane pl-8 pr-2 text-xs placeholder:text-ink-muted focus:border-series-1 focus:outline-none"
            />
          </span>
          <p className="shrink-0 text-2xs text-ink-muted">
            <span className="tabular text-ink-secondary">{filtered.length}</span> shown of{" "}
            <span className="tabular">{total.toLocaleString("en-US")}</span>
          </p>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="p-8 text-center text-sm text-ink-muted">
          No connection matches these filters. Absent is not zero - a corridor missing here
          may simply be one neither side reports.
        </p>
      ) : (
        <div className="max-h-[560px] overflow-auto">
          <table className="w-full min-w-[640px] text-xs">
            <caption className="sr-only">
              Largest directed trade connections{sectorName ? ` in ${sectorName}` : ""}
            </caption>
            <thead className="sticky top-0 z-10 bg-surface">
              <tr className="border-b border-hairline text-ink-muted">
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  #
                </th>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Seller
                </th>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Buyer
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Value
                </th>
                <th scope="col" className="w-1/4 px-3 py-2 text-left font-medium">
                  Relative
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Open
                </th>
              </tr>
            </thead>
            <tbody className="tabular">
              {filtered.map((row, i) => (
                <tr
                  key={`${row.reporter}-${row.partner}`}
                  className="group border-b border-hairline/50 transition-colors last:border-0 hover:bg-raised/60"
                >
                  <td className="px-3 py-2 text-ink-muted">{i + 1}</td>
                  <td className="px-3 py-2">
                    <Party iso={row.reporter} names={names} iso2={iso2} />
                  </td>
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-1.5">
                      <ArrowRight
                        className="h-3 w-3 shrink-0"
                        style={{ color: colors.export }}
                        aria-hidden
                      />
                      <Party iso={row.partner} names={names} iso2={iso2} />
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-ink">
                    <span className="inline-flex items-center gap-1.5">
                      {row.src === "importer" && (
                        <span
                          className="rounded-sm border border-hairline px-1 text-[9px] uppercase leading-[1.4] text-ink-muted"
                          title={`${names[row.reporter] ?? row.reporter} publishes no export figures. This is ${names[row.partner] ?? row.partner}'s own customs record of the same goods.`}
                        >
                          buyer
                        </span>
                      )}
                      {usd(row.value)}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="h-2 w-full overflow-hidden rounded-sm bg-raised">
                      <div
                        className="h-full rounded-sm"
                        style={{
                          width: `${Math.max(1.5, (row.value / max) * 100)}%`,
                          background: colors.export,
                        }}
                      />
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/corridor/${row.reporter}/${row.partner}`}
                      className="text-series-1 opacity-0 transition-opacity hover:underline group-hover:opacity-100 focus:opacity-100"
                    >
                      Corridor
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Party({
  iso,
  names,
  iso2,
}: {
  iso: string;
  names: Record<string, string>;
  iso2: Record<string, string | null>;
}) {
  return (
    <Link
      href={`/country/${iso}`}
      className="flex min-w-0 items-center gap-1.5 text-ink-secondary hover:text-ink hover:underline"
    >
      <CountryFlag iso2={iso2[iso] ?? null} name={names[iso] ?? iso} size="sm" />
      <span className="truncate">{names[iso] ?? iso}</span>
    </Link>
  );
}
