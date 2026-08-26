import { CalendarClock } from "lucide-react";
import { growth, usd } from "@/lib/format";

export interface FrontierReading {
  year: number;
  exports: number | null;
  imports: number | null;
  reporters: number;
  complete: boolean;
}

/**
 * Years newer than the main build, kept visibly apart from it.
 *
 * The rest of this app stops at 2023 because that is where WITS stops - it returns HTTP
 * 404 for 2024 and 2025 for every reporter. UN Comtrade has both, so these figures exist,
 * but they are a DIFFERENT SOURCE on a different vintage and they are not spliced onto
 * the WITS series anywhere. A single line running 2010-2025 with an invisible join at
 * 2023 would make a source change indistinguishable from a real move in trade.
 *
 * So: its own strip, its own source line, and the reporter count printed on any year that
 * is still filling up. A half-reported year shown beside a complete one reads as a
 * collapse in world trade, which is the single most misleading thing this overlay could
 * do if it were left unlabelled.
 *
 * A server component - it renders text and nothing else.
 */
export function FrontierNote({
  readings,
  baseYear,
  baseExports,
  baseImports,
  countryName,
  source,
  vintage,
}: {
  readings: FrontierReading[];
  /** The newest year of the main build, for the change figures. */
  baseYear: number;
  baseExports: number | null;
  baseImports: number | null;
  countryName: string;
  source: string;
  vintage: string;
}) {
  const usable = readings.filter((r) => r.exports !== null || r.imports !== null);
  if (!usable.length) return null;

  return (
    <section className="card p-4" aria-labelledby="frontier-note">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2
          id="frontier-note"
          className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-ink-muted"
        >
          <CalendarClock className="h-3 w-3" aria-hidden />
          Newer than the rest of this site
        </h2>
        <p className="text-2xs text-ink-muted">
          {source} · vintage {vintage}
        </p>
      </div>

      <p className="mt-1.5 text-xs leading-relaxed text-ink-secondary">
        Every other figure on this page is {baseYear}, the newest year the main source
        publishes. These are later years from a second source, shown apart rather than
        joined onto the series - a change of source and a change in trade look identical
        once they share a line. Each figure is that country&apos;s own annual total; the
        count beside the year says how much of the world has filed it yet.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {usable.map((reading) => (
          <div key={reading.year} className="rounded-lg border border-hairline bg-plane p-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="tabular text-sm font-semibold text-ink">{reading.year}</span>
              {/* An incomplete year says so on its face, with the count that makes the
                  claim checkable, rather than in a caveat further down the page. */}
              {reading.complete ? (
                <span className="tabular text-2xs text-ink-muted">
                  {reading.reporters} countries filed
                </span>
              ) : (
                <span className="chip border border-status-warning/40 bg-status-warning/10 text-ink-secondary">
                  partial · {reading.reporters} filed so far
                </span>
              )}
            </div>

            <dl className="mt-2 grid grid-cols-2 gap-2">
              <Figure
                label={`${countryName} sold`}
                value={reading.exports}
                delta={growth(reading.exports, baseExports)}
                baseYear={baseYear}
              />
              <Figure
                label={`${countryName} bought`}
                value={reading.imports}
                delta={growth(reading.imports, baseImports)}
                baseYear={baseYear}
              />
            </dl>

            {!reading.complete && (
              // What is incomplete is the YEAR ACROSS COUNTRIES, not this country's own
              // figure. A country that has filed has filed a full year; saying "this total
              // will rise" would tell the reader the wrong thing about the number in front
              // of them. The consequence that matters is that anything comparative for
              // this year - a ranking, a world total, a share - is built on a partial field.
              <p className="mt-2 text-[10px] leading-relaxed text-ink-muted">
                {reading.reporters} countries have filed {reading.year} so far. This is{" "}
                {countryName}&apos;s own full-year figure and is not itself partial, but any
                ranking, world total or share for {reading.year} would be drawn from an
                incomplete field, so none is computed here. Recent years can still be
                revised.
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function Figure({
  label,
  value,
  delta,
  baseYear,
}: {
  label: string;
  value: number | null;
  delta: number | null;
  baseYear: number;
}) {
  const up = delta !== null && delta > 0;
  const down = delta !== null && delta < 0;
  return (
    <div>
      <dt className="truncate text-[10px] uppercase tracking-wider text-ink-muted">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold leading-none">{value === null ? "-" : usd(value)}</dd>
      <dd className="tabular mt-1 text-[10px] text-ink-muted">
        {delta === null ? (
          "no comparison"
        ) : (
          <>
            <span className={up ? "text-delta-up" : down ? "text-delta-down" : undefined}>
              {up ? "▲" : down ? "▼" : "-"} {Math.abs(delta).toFixed(1)}%
            </span>{" "}
            on {baseYear}
          </>
        )}
      </dd>
    </div>
  );
}
