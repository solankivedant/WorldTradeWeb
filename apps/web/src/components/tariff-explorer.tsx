"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQueryState } from "nuqs";
import { ArrowUpDown, Search, SlidersHorizontal } from "lucide-react";
import { flagEmoji, pct } from "@/lib/format";
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
 * Rate is encoded by BAR LENGTH first. A heatmap over 200 rows would make the eye compare
 * hues down the page, which is exactly the comparison people are worst at; length against
 * a shared baseline is the comparison they are best at.
 *
 * Colour is a secondary channel and carries BANDS, not a continuous ramp - six named
 * steps of one hue, each with its band name in the row, so nothing is communicated by hue
 * alone. Duty-free keeps the reserved "good" status colour because it is a different kind
 * of fact (an agreement is in force), not merely a small number.
 */

const BANDS = [
  { max: 0.5, label: "Duty-free", swatch: "bg-status-good" },
  { max: 2.5, label: "Low", swatch: "bg-series-1/30" },
  { max: 5, label: "Moderate", swatch: "bg-series-1/50" },
  { max: 10, label: "Elevated", swatch: "bg-series-1/70" },
  { max: 15, label: "High", swatch: "bg-series-1/85" },
  { max: Infinity, label: "Very high", swatch: "bg-series-1" },
] as const;

function bandFor(rate: number) {
  return BANDS.find((b) => rate < b.max) ?? BANDS[BANDS.length - 1];
}

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
  const [, setReporter] = useQueryState("reporter", { defaultValue: "USA", shallow: false });
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("rate-desc");
  const [band, setBand] = useState<string>("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = rows;
    if (q) {
      list = list.filter(
        (r) => r.name.toLowerCase().includes(q) || r.iso3.toLowerCase().startsWith(q),
      );
    }
    if (band) list = list.filter((r) => bandFor(r.rate).label === band);

    const sorted = [...list];
    if (sort === "rate-desc") sorted.sort((a, b) => b.rate - a.rate);
    else if (sort === "rate-asc") sorted.sort((a, b) => a.rate - b.rate);
    else sorted.sort((a, b) => a.name.localeCompare(b.name));
    return sorted;
  }, [rows, query, sort, band]);

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
            <SlidersHorizontal className="h-3 w-3" aria-hidden />
            Band
          </span>
          <select
            value={band}
            onChange={(e) => setBand(e.target.value)}
            className="h-9 rounded-md border border-hairline bg-plane px-2 text-sm focus:border-series-1 focus:outline-none"
          >
            <option value="">All bands</option>
            {BANDS.map((b) => (
              <option key={b.label} value={b.label}>
                {b.label}
              </option>
            ))}
          </select>
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

      {filtered.length === 0 ? (
        <p className="p-8 text-center text-sm text-ink-muted">
          {rows.length === 0
            ? `No tariff schedule published for ${reporterName}.`
            : `No partner matches these filters. Try a shorter search, or "All bands".`}
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
                const meta = bandFor(row.rate);
                const focused = row.iso3 === focusPartner;
                return (
                  <tr
                    key={row.iso3}
                    className={`border-b border-hairline/50 transition-colors last:border-0 hover:bg-raised/60 ${
                      focused ? "bg-series-1/10" : ""
                    }`}
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={`/corridor/${row.iso3}/${reporter}`}
                        className="flex items-center gap-2 hover:underline"
                      >
                        <span aria-hidden>{flagEmoji(row.iso2)}</span>
                        <span className="text-ink-secondary">{row.name}</span>
                      </Link>
                    </td>
                    <td className="hidden px-3 py-2 text-ink-muted sm:table-cell">
                      {row.region ?? "-"}
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1.5 text-ink-secondary">
                        <span
                          className={`h-2.5 w-2.5 shrink-0 rounded-sm ${meta.swatch}`}
                          aria-hidden
                        />
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-ink">
                      {pct(row.rate, 2)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="h-2 w-full overflow-hidden rounded-sm bg-raised">
                        <div
                          className={`h-full rounded-sm ${meta.swatch}`}
                          style={{
                            width: `${Math.max((row.rate / max) * 100, row.rate > 0 ? 1.5 : 0)}%`,
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
