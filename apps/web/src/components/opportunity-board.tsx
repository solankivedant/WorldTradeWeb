"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownUp,
  Globe2,
  LayoutGrid,
  RotateCcw,
  Rows3,
  Search,
  Star,
  Target,
  X,
} from "lucide-react";
import { OpportunityCard } from "@/components/opportunity-card";
import { OpportunityTable } from "@/components/opportunity-table";
import { ScoreSpineLegend } from "@/components/charts/score-spine";
import { Segmented } from "@/components/segmented";
import { opportunityId, useShortlist } from "@/hooks/use-shortlist";
import type { Opportunity } from "@/lib/types";

/**
 * Everything the reader can do to a set of results WITHOUT going back to the server.
 *
 * The page's three existing controls - origin, sector, coverage - each re-score every
 * country on earth, so each is a round-trip and each rightly lives in the URL. But most
 * of what a reader actually wants to do next is narrowing what is already on screen:
 * "only the ones above 60", "only Africa", "just show me a table I can scan down". Those
 * were round-trips too, or simply impossible, and a page that reloads to hide four cards
 * feels broken.
 *
 * So the split is by cost, and it is visible in the layout: URL controls in the filter
 * bar above, instant controls in this strip attached to the results themselves.
 *
 * Sector is deliberately NOT duplicated as an instant filter. Choosing a sector in the
 * URL bar also lifts the engine's diversification caps and returns the full ranked list
 * for it, so a client-side sector chip would look like the same action and quietly give
 * a different, shallower answer.
 */

export type SortKey = "score" | "market" | "share" | "tariff" | "destination" | "sector";

const SORTS: { id: SortKey; label: string; hint: string }[] = [
  { id: "score", label: "Score", hint: "The engine's own ranking" },
  { id: "market", label: "Market size", hint: "How much the destination imports of the sector" },
  { id: "share", label: "Smallest presence", hint: "Where the origin supplies least today" },
  { id: "tariff", label: "Lowest tariff", hint: "Rates the destination charges the origin" },
  { id: "destination", label: "Country name", hint: "Alphabetical by destination" },
  { id: "sector", label: "Sector", hint: "Grouped by sector name" },
];

/** Same cuts as the card's band labels, so the chips and the cards cannot disagree. */
const BANDS = [
  { id: "strong", label: "Strong fit", min: 70, max: 101 },
  { id: "look", label: "Worth a look", min: 50, max: 70 },
  { id: "early", label: "Early signal", min: 0, max: 50 },
] as const;

type BandId = (typeof BANDS)[number]["id"];

/** Descending is right for every measure except the two that read as names. */
const ASCENDING_BY_DEFAULT = new Set<SortKey>(["destination", "sector", "tariff", "share"]);

export function OpportunityBoard({
  results,
  originIso,
  originName,
  componentLegend,
}: {
  results: Opportunity[];
  originIso: string;
  originName: string;
  /** Label and weight cap per component, in engine order, for the spine legend. */
  componentLegend: { label: string; max: number }[];
}) {
  const [view, setView] = useState<"cards" | "table">("cards");
  const [sort, setSort] = useState<SortKey>("score");
  const [descending, setDescending] = useState(true);
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("");
  const [band, setBand] = useState<BandId | "">("");
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const shortlist = useShortlist();

  const regions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of results) {
      if (!r.destinationRegion) continue;
      counts.set(r.destinationRegion, (counts.get(r.destinationRegion) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [results]);

  const bandCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const b of BANDS) {
      counts[b.id] = results.filter((r) => r.score >= b.min && r.score < b.max).length;
    }
    return counts;
  }, [results]);

  const pinnedHere = useMemo(
    () =>
      shortlist.ready
        ? results.filter((r) =>
            shortlist.has(opportunityId(originIso, r.destination, r.sector)),
          ).length
        : 0,
    [results, shortlist, originIso],
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const chosen = BANDS.find((b) => b.id === band);
    let list = results.filter((r) => {
      if (q && !r.destinationName.toLowerCase().includes(q) && !r.sectorName.toLowerCase().includes(q))
        return false;
      if (region && r.destinationRegion !== region) return false;
      if (chosen && (r.score < chosen.min || r.score >= chosen.max)) return false;
      if (pinnedOnly && !shortlist.has(opportunityId(originIso, r.destination, r.sector)))
        return false;
      return true;
    });

    // Null is "not published", never a favourable rate and never a zero share, so unknowns
    // sort to the bottom in either direction rather than winning a "lowest tariff" sort.
    const dir = descending ? -1 : 1;
    const num = (v: number | null) => (v === null ? null : v);
    list = [...list].sort((a, b) => {
      switch (sort) {
        case "market":
          return dir * (a.evidence.destinationImports - b.evidence.destinationImports);
        case "share": {
          const x = num(a.evidence.currentShare);
          const y = num(b.evidence.currentShare);
          if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
          return dir * (x - y);
        }
        case "tariff": {
          const x = num(a.evidence.tariff);
          const y = num(b.evidence.tariff);
          if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
          return dir * (x - y);
        }
        case "destination":
          return dir * a.destinationName.localeCompare(b.destinationName);
        case "sector":
          return dir * (a.sectorName.localeCompare(b.sectorName) || b.score - a.score);
        default:
          return dir * (a.score - b.score);
      }
    });
    return list;
  }, [results, query, region, band, pinnedOnly, sort, descending, shortlist, originIso]);

  const refined = query !== "" || region !== "" || band !== "" || pinnedOnly;

  function changeSort(key: SortKey) {
    if (key === sort) {
      setDescending((d) => !d);
      return;
    }
    setSort(key);
    setDescending(!ASCENDING_BY_DEFAULT.has(key));
  }

  function reset() {
    setQuery("");
    setRegion("");
    setBand("");
    setPinnedOnly(false);
  }

  return (
    <div>
      {/* ---- the instant strip ---- */}
      <div className="card mt-3 flex flex-col gap-2.5 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label="Result view"
            value={view}
            onChange={setView}
            options={[
              { id: "cards", label: "Cards", Icon: LayoutGrid, hint: "One market at a time, with its reasoning" },
              { id: "table", label: "Table", Icon: Rows3, hint: "All markets in columns, for scanning" },
            ]}
          />

          <label className="flex items-center gap-1.5 text-2xs text-ink-muted">
            <ArrowDownUp className="h-3 w-3" aria-hidden />
            <span className="sr-only sm:not-sr-only">Sort by</span>
            <select
              value={sort}
              onChange={(e) => changeSort(e.target.value as SortKey)}
              aria-label="Sort results"
              className="h-8 rounded-md border border-hairline bg-plane px-1.5 text-xs text-ink focus:border-series-1 focus:outline-none"
            >
              {SORTS.map((s) => (
                <option key={s.id} value={s.id} title={s.hint}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setDescending((d) => !d)}
            title={descending ? "Largest first - click for smallest first" : "Smallest first - click for largest first"}
            className="h-8 rounded-md border border-hairline px-2 text-2xs text-ink-secondary transition-colors hover:bg-raised hover:text-ink"
          >
            {descending ? "High to low" : "Low to high"}
          </button>

          <span className="relative block min-w-0 flex-1 sm:flex-none">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted"
              aria-hidden
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a market or sector..."
              aria-label="Filter results by market or sector name"
              className="h-8 w-full rounded-md border border-hairline bg-plane pl-8 pr-2 text-xs placeholder:text-ink-muted focus:border-series-1 focus:outline-none sm:w-56"
            />
          </span>

          <button
            type="button"
            onClick={() => setPinnedOnly((p) => !p)}
            aria-pressed={pinnedOnly}
            disabled={!shortlist.ready || pinnedHere === 0}
            title="Show only the markets you have starred"
            className={`flex h-8 items-center gap-1.5 rounded-md border px-2 text-2xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              pinnedOnly
                ? "border-series-1/50 bg-series-1/10 text-series-1"
                : "border-hairline text-ink-secondary hover:bg-raised hover:text-ink"
            }`}
          >
            <Star className={`h-3 w-3 ${pinnedOnly ? "fill-current" : ""}`} aria-hidden />
            Shortlist
            {/* Rendered only once storage has been read - before that the server and the
                browser would disagree about the count. */}
            <span className="tabular">{shortlist.ready ? pinnedHere : ""}</span>
          </button>

          <p className="ml-auto text-2xs text-ink-muted">
            <span className="tabular text-ink-secondary">{shown.length}</span> of{" "}
            <span className="tabular">{results.length}</span> shown
          </p>
        </div>

        {/* ---- narrow by band and by region, as counts you can click ---- */}
        <div className="flex flex-wrap items-center gap-1.5 border-t border-hairline pt-2.5">
          <span className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">
            Narrow
          </span>
          {BANDS.map((b) => (
            <Chip
              key={b.id}
              on={band === b.id}
              disabled={bandCounts[b.id] === 0}
              onClick={() => setBand(band === b.id ? "" : b.id)}
              count={bandCounts[b.id]}
              icon={<Target className="h-3 w-3" aria-hidden />}
            >
              {b.label}
            </Chip>
          ))}
          <span className="mx-1 h-4 w-px bg-hairline" aria-hidden />
          {regions.map(([name, count]) => (
            <Chip
              key={name}
              on={region === name}
              onClick={() => setRegion(region === name ? "" : name)}
              count={count}
              icon={<Globe2 className="h-3 w-3" aria-hidden />}
            >
              {name}
            </Chip>
          ))}
          {refined && (
            <button
              type="button"
              onClick={reset}
              className="ml-auto flex items-center gap-1 rounded-md border border-hairline px-2 py-1 text-2xs text-ink-secondary transition-colors hover:bg-raised hover:text-ink"
            >
              <RotateCcw className="h-3 w-3" aria-hidden />
              Clear
            </button>
          )}
        </div>

        <div className="border-t border-hairline pt-2.5">
          <ScoreSpineLegend components={componentLegend} />
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="card mt-3 p-8 text-center">
          <p className="text-sm text-ink-secondary">
            Nothing in this result set matches those refinements.
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            This narrows what is already on screen - it does not re-run the engine. Clear it
            to see all {results.length} again, or change the origin, sector or coverage above
            to score a different set.
          </p>
          <button
            type="button"
            onClick={reset}
            className="mt-3 rounded-md border border-hairline px-3 py-1.5 text-xs text-ink-secondary transition-colors hover:bg-raised hover:text-ink"
          >
            Clear refinements
          </button>
        </div>
      ) : view === "table" ? (
        <div className="mt-3">
          <OpportunityTable
            rows={shown}
            originIso={originIso}
            sort={sort}
            descending={descending}
            onSort={changeSort}
            shortlistReady={shortlist.ready}
            isPinned={shortlist.has}
            onPin={shortlist.toggle}
          />
        </div>
      ) : (
        <div className="mt-3 grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((opportunity, i) => {
            const id = opportunityId(originIso, opportunity.destination, opportunity.sector);
            return (
              <OpportunityCard
                key={id}
                opportunity={opportunity}
                originIso={originIso}
                originName={originName}
                rank={i + 1}
                pinned={shortlist.ready ? shortlist.has(id) : false}
                onPin={() => shortlist.toggle(id)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * One instant refinement. The glyph separates the two KINDS of chip in this row - a score
 * band from a region - which otherwise differ only in wording and read as one long strip.
 */
function Chip({
  on,
  count,
  disabled,
  icon,
  onClick,
  children,
}: {
  on: boolean;
  count: number;
  disabled?: boolean;
  icon?: React.ReactNode;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      className={`flex items-center gap-1 rounded-md border px-2 py-1 text-2xs transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
        on
          ? "border-series-1/50 bg-series-1/10 font-medium text-series-1"
          : "border-hairline text-ink-secondary hover:bg-raised hover:text-ink"
      }`}
    >
      {icon}
      {children}
      <span className="tabular text-ink-muted">{count}</span>
      {on && <X className="h-2.5 w-2.5" aria-hidden />}
    </button>
  );
}
