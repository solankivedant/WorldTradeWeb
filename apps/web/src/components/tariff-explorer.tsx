"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQueryState } from "nuqs";
import { ArrowUpDown, Search, X } from "lucide-react";
import { CountryFlag } from "@/components/country-flag";
import { useTheme } from "@/components/theme";
import { tariffBandFor, tariffBands, type TariffBand } from "@/lib/palette";
import { pct } from "@/lib/format";
import { startRouteProgress } from "@/lib/nav-progress";

interface Row {
  iso3: string;
  name: string;
  iso2: string | null;
  region: string | null;
  rate: number;
}

/**
 * Tariff rates a reporter charges each partner.
 *
 * Rate is encoded three ways at once, deliberately. BAR LENGTH is primary: a length
 * against a shared baseline is the comparison people are best at, where comparing hues
 * down a 200-row page is the one they are worst at. COLOUR carries the same rate as six
 * named bands (see `tariffBands` for the ramp and why it is banded rather than
 * continuous), so a reader can pick out the high partners without reading a digit. And
 * the NUMBER is printed on its own band colour, which is the part that was missing - the
 * old table put the colour only in a 10px swatch two columns away from the rate, so
 * nothing about the figure itself said which band it was in.
 *
 * The band scale is the filter. Clicking a swatch narrows the table to that band and
 * clicking it again clears it, which turns the legend from a static key into the control
 * people reach for anyway - the old separate "Band" dropdown said the same thing twice
 * and neither copy showed what the colours actually were.
 *
 * Nothing is carried by hue alone: every row names its band in words and prints its rate.
 */

type Sort = "rate-desc" | "rate-asc" | "name";

export function TariffExplorer({
  countries,
  reporter,
  reporterName,
  rows,
  focusPartner,
}: {
  countries: { iso3: string; name: string }[];
  reporter: string;
  reporterName: string;
  rows: Row[];
  focusPartner: string;
}) {
  const { resolved } = useTheme();
  const bands = tariffBands(resolved);

  const [, setReporter] = useQueryState("reporter", { defaultValue: "USA", shallow: false });
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("rate-desc");
  const [band, setBand] = useState<string>("");

  /** How many partners sit in each band, so the scale doubles as a distribution. */
  const counts = useMemo(() => {
    const tally: Record<string, number> = {};
    for (const r of rows) {
      const label = tariffBandFor(r.rate, resolved).label;
      tally[label] = (tally[label] ?? 0) + 1;
    }
    return tally;
  }, [rows, resolved]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = rows;
    if (q) {
      list = list.filter(
        (r) => r.name.toLowerCase().includes(q) || r.iso3.toLowerCase().startsWith(q),
      );
    }
    if (band) list = list.filter((r) => tariffBandFor(r.rate, resolved).label === band);

    const sorted = [...list];
    if (sort === "rate-desc") sorted.sort((a, b) => b.rate - a.rate);
    else if (sort === "rate-asc") sorted.sort((a, b) => a.rate - b.rate);
    else sorted.sort((a, b) => a.name.localeCompare(b.name));
    return sorted;
  }, [rows, query, sort, band, resolved]);

  const max = Math.max(...rows.map((r) => r.rate), 1);

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-end gap-3 border-b border-hairline p-3">
        <label className="flex flex-col gap-1">
          <span className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">
            Charged by
          </span>
          <select
            value={reporter}
            onChange={(e) => {
              startRouteProgress();
              setReporter(e.target.value);
            }}
            className="h-9 w-56 rounded-md border border-hairline bg-plane px-2 text-sm focus:border-series-1 focus:outline-none"
          >
            {countries.map((c) => (
              <option key={c.iso3} value={c.iso3}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">
            Find a partner
          </span>
          <span className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted"
              aria-hidden
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter partners..."
              className="h-9 w-52 rounded-md border border-hairline bg-plane pl-8 pr-2 text-sm placeholder:text-ink-muted focus:border-series-1 focus:outline-none"
            />
          </span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="flex items-center gap-1 text-2xs font-semibold uppercase tracking-wider text-ink-muted">
            <ArrowUpDown className="h-3 w-3" aria-hidden />
            Sort
          </span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="h-9 rounded-md border border-hairline bg-plane px-2 text-sm focus:border-series-1 focus:outline-none"
          >
            <option value="rate-desc">Highest rate first</option>
            <option value="rate-asc">Lowest rate first</option>
            <option value="name">Country name</option>
          </select>
        </label>

        <p className="ml-auto self-center text-xs text-ink-muted">
          <span className="tabular text-ink-secondary">{filtered.length}</span> of{" "}
          <span className="tabular">{rows.length}</span> partners
        </p>
      </div>

      <BandScale
        bands={bands}
        counts={counts}
        active={band}
        onPick={(label) => setBand((current) => (current === label ? "" : label))}
      />

      {filtered.length === 0 ? (
        <p className="p-8 text-center text-sm text-ink-muted">
          {rows.length === 0
            ? `No tariff schedule published for ${reporterName}.`
            : "No partner matches these filters. Try a shorter search, or clear the band."}
        </p>
      ) : (
        <div className="max-h-[620px] overflow-auto">
          <table className="w-full text-xs">
            <caption className="sr-only">
              Effectively applied tariff rates {reporterName} charges each partner
            </caption>
            <thead className="sticky top-0 z-10 bg-surface">
              <tr className="border-b border-hairline text-ink-muted">
                <th scope="col" className="px-3 py-2.5 text-left font-medium">
                  Partner
                </th>
                <th scope="col" className="hidden px-3 py-2.5 text-left font-medium sm:table-cell">
                  Region
                </th>
                <th scope="col" className="px-3 py-2.5 text-left font-medium">
                  Band
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">
                  Applied rate
                </th>
                <th scope="col" className="w-2/5 px-3 py-2.5 text-left font-medium">
                  Relative to this schedule
                </th>
              </tr>
            </thead>
            <tbody className="tabular">
              {filtered.map((row) => {
                const meta = tariffBandFor(row.rate, resolved);
                const focused = row.iso3 === focusPartner;
                const explain = `${reporterName} charges goods from ${row.name} ${pct(row.rate, 2)} on average - ${meta.label.toLowerCase()}, ${meta.blurb}`;
                return (
                  <tr
                    key={row.iso3}
                    title={explain}
                    className={`group border-b border-hairline/50 transition-colors last:border-0 hover:bg-raised/60 ${
                      focused ? "bg-series-1/10" : ""
                    }`}
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={`/corridor/${row.iso3}/${reporter}`}
                        title={`${row.name} exporting into ${reporterName} - open the corridor`}
                        className="flex items-center gap-2 hover:underline"
                      >
                        <CountryFlag iso2={row.iso2} name={row.name} size="sm" />
                        <span className="text-ink-secondary group-hover:text-ink">{row.name}</span>
                      </Link>
                    </td>
                    <td className="hidden px-3 py-2 text-ink-muted sm:table-cell">
                      {row.region ?? "-"}
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1.5 text-ink-secondary">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-sm"
                          style={{ background: meta.color }}
                          aria-hidden
                        />
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {/* The figure wears its own band colour, so the rate and the colour
                          cannot be read apart. Ink is measured against the fill - see
                          `tariffBands`. */}
                      <span
                        className="inline-block min-w-[3.75rem] rounded-md px-2 py-0.5 text-right font-semibold"
                        style={{ background: meta.color, color: meta.ink }}
                      >
                        {pct(row.rate, 2)}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="h-2.5 w-full overflow-hidden rounded-sm bg-raised">
                        <div
                          className="h-full rounded-sm transition-[width] duration-200"
                          style={{
                            width: `${Math.max((row.rate / max) * 100, row.rate > 0 ? 1.5 : 0)}%`,
                            background: meta.color,
                          }}
                        />
                      </div>
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

/**
 * The band key, doubling as the band filter and as a distribution of the schedule.
 *
 * Each step shows how many partners fall in it, which answers "is this a low-tariff
 * country?" before any row is read - a schedule with 140 duty-free partners and one at
 * 30% looks completely different from one spread evenly, and the table alone hides that.
 */
function BandScale({
  bands,
  counts,
  active,
  onPick,
}: {
  bands: TariffBand[];
  counts: Record<string, number>;
  active: string;
  onPick: (label: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-hairline bg-plane/40 px-3 py-2">
      <span className="mr-1 text-2xs font-semibold uppercase tracking-wider text-ink-muted">
        Rate band
      </span>
      {bands.map((b) => {
        const n = counts[b.label] ?? 0;
        const on = active === b.label;
        return (
          <button
            key={b.label}
            type="button"
            onClick={() => onPick(b.label)}
            disabled={n === 0 && !on}
            aria-pressed={on}
            title={`${b.label} - ${b.blurb}. ${n} partner${n === 1 ? "" : "s"}.`}
            className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-2xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              on
                ? "border-transparent text-ink"
                : "border-hairline text-ink-secondary hover:bg-raised"
            }`}
            style={on ? { background: b.color, color: b.ink, borderColor: b.color } : undefined}
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm ring-1 ring-inset ring-black/10"
              style={{ background: b.color }}
              aria-hidden
            />
            {b.label}
            <span className="tabular opacity-70">{n}</span>
          </button>
        );
      })}
      {active && (
        <button
          type="button"
          onClick={() => onPick(active)}
          className="flex items-center gap-1 rounded-md px-1.5 py-1 text-2xs text-ink-muted hover:text-ink"
        >
          <X className="h-3 w-3" aria-hidden />
          Clear
        </button>
      )}
    </div>
  );
}
