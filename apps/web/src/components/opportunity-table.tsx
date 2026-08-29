"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, Star } from "lucide-react";
import { CountryFlag } from "@/components/country-flag";
import { ScoreSpine } from "@/components/charts/score-spine";
import { SectorIcon } from "@/components/sector-icon";
import { pct, usd } from "@/lib/format";
import { opportunityId } from "@/hooks/use-shortlist";
import { scoreBand } from "@/components/opportunity-card";
import type { Opportunity } from "@/lib/types";
import type { SortKey } from "./opportunity-board";

/**
 * The same opportunities as rows.
 *
 * Cards and a table answer different questions about one result set, which is why both
 * exist rather than one replacing the other. A card is for reading ONE market: it has
 * room for the claim in a sentence and the working underneath. A table is for comparing
 * SIXTY: figures land in columns, so "which of these has the lowest tariff" is a glance
 * down one column instead of sixty separate readings across a grid.
 *
 * The score column keeps the spine rather than dropping to a bare number, because the
 * composition is the thing a ranked list most easily hides - a column of scores from 71
 * to 68 to 66 looks like a smooth ranking of the same kind of thing, and it is not.
 *
 * Sorting is lifted to the board rather than held here: the card view sorts too, and two
 * copies of the comparator would eventually disagree about what "best tariff" means.
 */
export function OpportunityTable({
  rows,
  originIso,
  sort,
  descending,
  onSort,
  shortlistReady,
  isPinned,
  onPin,
}: {
  rows: Opportunity[];
  originIso: string;
  sort: SortKey;
  descending: boolean;
  onSort: (key: SortKey) => void;
  shortlistReady: boolean;
  isPinned: (id: string) => boolean;
  onPin: (id: string) => void;
}) {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-xs">
          <caption className="sr-only">
            Scored export opportunities for {originIso}, one row per destination market and
            sector
          </caption>
          <thead>
            <tr className="border-b border-hairline text-ink-muted">
              <th scope="col" className="w-8 px-2 py-2 text-left font-medium">
                <span className="sr-only">Shortlist</span>
              </th>
              <th scope="col" className="px-3 py-2 text-left font-medium">
                #
              </th>
              <Head col="destination" sort={sort} descending={descending} onSort={onSort} align="left">
                Market
              </Head>
              <Head col="sector" sort={sort} descending={descending} onSort={onSort} align="left">
                Sector
              </Head>
              <Head col="score" sort={sort} descending={descending} onSort={onSort} align="right">
                Score
              </Head>
              <th scope="col" className="w-[16%] px-3 py-2 text-left font-medium">
                Made up of
              </th>
              <Head col="market" sort={sort} descending={descending} onSort={onSort} align="right">
                Market size
              </Head>
              <Head col="share" sort={sort} descending={descending} onSort={onSort} align="right">
                Share today
              </Head>
              <Head col="tariff" sort={sort} descending={descending} onSort={onSort} align="right">
                Tariff
              </Head>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Open
              </th>
            </tr>
          </thead>
          <tbody className="tabular">
            {rows.map((row, i) => {
              const id = opportunityId(originIso, row.destination, row.sector);
              const pinned = shortlistReady && isPinned(id);
              return (
                <tr
                  key={id}
                  className={`group border-b border-hairline/50 transition-colors last:border-0 hover:bg-raised/60 ${
                    pinned ? "bg-series-1/5" : ""
                  }`}
                >
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      onClick={() => onPin(id)}
                      aria-pressed={pinned}
                      title={pinned ? "Remove from your shortlist" : "Add to your shortlist"}
                      className={`rounded p-1 transition-colors hover:bg-raised ${
                        pinned ? "text-series-1" : "text-ink-muted opacity-0 group-hover:opacity-100 focus:opacity-100"
                      }`}
                    >
                      <Star className={`h-3 w-3 ${pinned ? "fill-current" : ""}`} aria-hidden />
                      <span className="sr-only">
                        {pinned ? "Remove from shortlist" : "Add to shortlist"}
                      </span>
                    </button>
                  </td>
                  <td className="px-3 py-2 text-ink-muted">{i + 1}</td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/country/${row.destination}`}
                      className="flex min-w-0 items-center gap-1.5 text-ink-secondary hover:text-ink hover:underline"
                    >
                      <CountryFlag iso2={row.destinationIso2} name={row.destinationName} size="sm" />
                      <span className="truncate">{row.destinationName}</span>
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/product/${encodeURIComponent(row.sector)}`}
                      className="flex min-w-0 items-center gap-1.5 text-ink-secondary hover:text-ink hover:underline"
                    >
                      <SectorIcon code={row.sector} className="h-3.5 w-3.5" />
                      <span className="truncate">{row.sectorName}</span>
                    </Link>
                  </td>
                  <td className={`px-3 py-2 text-right font-medium ${scoreBand(row.score).tone}`}>
                    {row.score}
                  </td>
                  <td className="px-3 py-2">
                    <ScoreSpine components={row.components} score={row.score} height={7} />
                  </td>
                  <td className="px-3 py-2 text-right text-ink-secondary">
                    {usd(row.evidence.destinationImports)}
                  </td>
                  <td className="px-3 py-2 text-right text-ink-secondary">
                    {row.evidence.currentShare === null ? (
                      <span className="text-ink-muted">not reported</span>
                    ) : (
                      pct(row.evidence.currentShare, 1)
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-ink-secondary">
                    {row.evidence.tariff === null ? (
                      <span className="text-ink-muted" title="No rate published for this pair">
                        not published
                      </span>
                    ) : (
                      pct(row.evidence.tariff)
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/corridor/${originIso}/${row.destination}`}
                      title={`${originIso} to ${row.destinationName}: both directions of this corridor`}
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
      <p className="border-t border-hairline px-4 py-2 text-2xs leading-relaxed text-ink-muted">
        Share today is estimated from the origin&apos;s overall share of this
        market&apos;s imports, not measured per sector. A tariff shown as not published is
        scored neutral, never favourable.
      </p>
    </div>
  );
}

/**
 * A sortable column header.
 *
 * The arrow appears only on the active column. A permanent up/down glyph on every header
 * makes all nine look active at once, and then nothing signals which one the table is
 * actually ordered by.
 */
function Head({
  col,
  sort,
  descending,
  onSort,
  align,
  children,
}: {
  col: SortKey;
  sort: SortKey;
  descending: boolean;
  onSort: (key: SortKey) => void;
  align: "left" | "right";
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
        type="button"
        onClick={() => onSort(col)}
        className={`inline-flex items-center gap-1 transition-colors hover:text-ink ${
          on ? "text-ink" : ""
        }`}
      >
        {align === "right" && on && <Arrow className="h-3 w-3" aria-hidden />}
        {children}
        {align === "left" && on && <Arrow className="h-3 w-3" aria-hidden />}
      </button>
    </th>
  );
}
