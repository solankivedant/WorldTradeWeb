"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQueryState } from "nuqs";
import { ArrowDown, ArrowLeftRight, ArrowRight, ArrowUp, Search } from "lucide-react";
import { CountryFlag } from "@/components/country-flag";
import { useTheme } from "@/components/theme";
import { flowColors } from "@/lib/palette";
import { startRouteProgress } from "@/lib/nav-progress";
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
 * The search box and the column sorts work client-side over the rows already on screen.
 * Anything that would change WHICH rows the server sends - sector, country, region, size -
 * lives in the URL filter bar instead, because those need the full cube.
 *
 * Every row can also be SENT to the comparison pane. Finding an interesting corridor here
 * and then having to reassemble it by hand out of four country pickers was the single
 * biggest gap on this page: the reader had already identified the thing they wanted to
 * compare, and the app made them describe it again.
 */

type Sort = "value" | "seller" | "buyer";

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
  const [sort, setSort] = useState<Sort>("value");
  const [descending, setDescending] = useState(true);

  const [a, setA] = useQueryState("a", { defaultValue: "", shallow: false });
  const [b, setB] = useQueryState("b", { defaultValue: "", shallow: false });
  const [c, setC] = useQueryState("c", { defaultValue: "", shallow: false });
  const [d, setD] = useQueryState("d", { defaultValue: "", shallow: false });
  const [, setView] = useQueryState("view", { defaultValue: "sectors", shallow: false });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const name = (iso: string) => (names[iso] ?? iso).toLowerCase();
    const list = q
      ? rows.filter(
          (r) =>
            name(r.reporter).includes(q) ||
            name(r.partner).includes(q) ||
            r.reporter.toLowerCase().startsWith(q) ||
            r.partner.toLowerCase().startsWith(q),
        )
      : rows;

    const dir = descending ? -1 : 1;
    return [...list].sort((x, y) => {
      if (sort === "seller") return dir * name(y.reporter).localeCompare(name(x.reporter));
      if (sort === "buyer") return dir * name(y.partner).localeCompare(name(x.partner));
      return dir * (x.value - y.value);
    });
  }, [rows, query, names, sort, descending]);

  const max = Math.max(...rows.map((r) => r.value), 1);

  function changeSort(key: Sort) {
    if (key === sort) {
      setDescending((v) => !v);
      return;
    }
    setSort(key);
    // Value reads largest-first; names read A-Z. Descending on a name column is a list
    // starting at Zimbabwe, which nobody asked for.
    setDescending(key === "value");
  }

  /**
   * Load a row into the comparison, filling the first empty slot.
   *
   * With both slots full the SECOND is replaced, never the first. The usual sequence is
   * "keep the one I care about, try this against it", so overwriting the anchor would
   * make the pane unusable for exactly the comparison it exists for.
   */
  function compare(row: CorridorRow) {
    startRouteProgress();
    if (!a && !b) {
      setA(row.reporter);
      setB(row.partner);
    } else {
      setC(row.reporter);
      setD(row.partner);
    }
    setView("compare");
  }

  const slot = !a && !b ? "first" : "second";

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
        <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
          <span className="relative block min-w-0 flex-1 sm:flex-none">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted"
              aria-hidden
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a country in this list..."
              className="h-8 w-full rounded-md border border-hairline bg-plane pl-8 pr-2 text-xs placeholder:text-ink-muted focus:border-series-1 focus:outline-none sm:w-56"
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
          <table className="w-full min-w-[720px] text-xs">
            <caption className="sr-only">
              Largest directed trade connections{sectorName ? ` in ${sectorName}` : ""}
            </caption>
            <thead className="sticky top-0 z-10 bg-surface">
              <tr className="border-b border-hairline text-ink-muted">
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  #
                </th>
                <Head col="seller" sort={sort} descending={descending} onSort={changeSort}>
                  Seller
                </Head>
                <Head col="buyer" sort={sort} descending={descending} onSort={changeSort}>
                  Buyer
                </Head>
                <Head col="value" sort={sort} descending={descending} onSort={changeSort} align="right">
                  Value
                </Head>
                <th scope="col" className="w-1/4 px-3 py-2 text-left font-medium">
                  Relative
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Open
                </th>
              </tr>
            </thead>
            <tbody className="tabular">
              {filtered.map((row, i) => {
                const inCompare =
                  (row.reporter === a && row.partner === b) ||
                  (row.reporter === c && row.partner === d);
                return (
                  <tr
                    key={`${row.reporter}-${row.partner}`}
                    className={`group border-b border-hairline/50 transition-colors last:border-0 hover:bg-raised/60 ${
                      inCompare ? "bg-series-1/10" : ""
                    }`}
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
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      <button
                        onClick={() => compare(row)}
                        title={
                          inCompare
                            ? "Already in the comparison"
                            : `Put ${names[row.reporter] ?? row.reporter} and ${names[row.partner] ?? row.partner} in the ${slot} comparison slot`
                        }
                        className={`mr-2 inline-flex items-center gap-1 text-series-1 transition-opacity hover:underline ${
                          inCompare ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100"
                        }`}
                      >
                        <ArrowLeftRight className="h-3 w-3" aria-hidden />
                        {inCompare ? "Comparing" : "Compare"}
                      </button>
                      <Link
                        href={`/corridor/${row.reporter}/${row.partner}`}
                        className="text-series-1 opacity-0 transition-opacity hover:underline group-hover:opacity-100 focus:opacity-100"
                      >
                        Corridor
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** A sortable header. The arrow marks the active column only - see `OpportunityTable`. */
function Head({
  col,
  sort,
  descending,
  onSort,
  align = "left",
  children,
}: {
  col: Sort;
  sort: Sort;
  descending: boolean;
  onSort: (key: Sort) => void;
  align?: "left" | "right";
  children: React.ReactNode;
}) {
  const on = sort === col;
  const Arrow = descending ? ArrowDown : ArrowUp;
  return (
    <th
      scope="col"
      aria-sort={on ? (descending ? "descending" : "ascending") : "none"}
      className={`px-3 py-2 font-medium ${align === "right" ? "text-right" : "text-left"}`}
    >
      <button
        onClick={() => onSort(col)}
        className={`inline-flex items-center gap-1 transition-colors hover:text-ink ${on ? "text-ink" : ""}`}
      >
        {align === "right" && on && <Arrow className="h-3 w-3" aria-hidden />}
        {children}
        {align === "left" && on && <Arrow className="h-3 w-3" aria-hidden />}
      </button>
    </th>
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
