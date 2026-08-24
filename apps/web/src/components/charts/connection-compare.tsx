"use client";

import Link from "next/link";
import { ArrowLeftRight, ArrowRight, ExternalLink, TriangleAlert } from "lucide-react";
import { CompareBar } from "@/components/charts/compare-bar";
import { CountryFlag } from "@/components/country-flag";
import { useTheme } from "@/components/theme";
import { flowColors, tariffBandFor } from "@/lib/palette";
import { pct, usd } from "@/lib/format";

/** One side of the comparison, assembled on the server. */
export interface ConnectionSummary {
  a: { iso3: string; iso2: string | null; name: string };
  b: { iso3: string; iso2: string | null; name: string };
  aToB: number | null;
  bToA: number | null;
  balance: number | null;
  mirrorGapPct: number | null;
  tariffAOnB: number | null;
  tariffBOnA: number | null;
  /** Top sectors in the corridor, both directions on one row. */
  sectors: { code: string; name: string; aToB: number | null; bToA: number | null }[];
  /** Whether either end publishes nothing, so the figures came from the other side. */
  buyerSourced: boolean;
}

/**
 * Two connections, measured the same way, side by side.
 *
 * This is the question the ranked list cannot answer: not "which corridors are biggest"
 * but "how does this route compare with that one". Both cards use ONE shared scale for
 * their sector bars, which is the whole point - scaling each card to its own maximum
 * would make a $2B corridor's bars look exactly like a $200B corridor's, and the
 * comparison would be worse than useless because it would look precise.
 */
export function ConnectionCompare({
  left,
  right,
}: {
  left: ConnectionSummary | null;
  right: ConnectionSummary | null;
}) {
  const { resolved } = useTheme();

  if (!left && !right) {
    return (
      <div className="card flex min-h-[180px] flex-col items-center justify-center gap-2 p-8 text-center">
        <ArrowLeftRight className="h-5 w-5 text-ink-muted" aria-hidden />
        <p className="text-sm text-ink-secondary">Pick two connections to compare them.</p>
        <p className="max-w-md text-xs leading-relaxed text-ink-muted">
          Both sides are drawn against one shared scale, so a bar means the same thing in
          either card. Sector detail comes from each seller&apos;s own report.
        </p>
      </div>
    );
  }

  // One scale across BOTH cards and both directions.
  const scale = Math.max(
    ...[left, right].flatMap((c) =>
      c ? c.sectors.map((s) => Math.max(s.aToB ?? 0, s.bToA ?? 0)) : [0],
    ),
    1,
  );

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <ConnectionCard summary={left} scale={scale} mode={resolved} slot="First connection" />
      <ConnectionCard summary={right} scale={scale} mode={resolved} slot="Second connection" />
    </div>
  );
}

function ConnectionCard({
  summary,
  scale,
  mode,
  slot,
}: {
  summary: ConnectionSummary | null;
  scale: number;
  mode: "light" | "dark";
  slot: string;
}) {
  const colors = flowColors(mode);

  if (!summary) {
    return (
      <div className="card flex min-h-[240px] items-center justify-center p-6 text-center text-xs text-ink-muted">
        Pick two countries for the {slot.toLowerCase()}.
      </div>
    );
  }

  const { a, b } = summary;
  const nothing = summary.aToB === null && summary.bToA === null;
  const materialGap = summary.mirrorGapPct !== null && Math.abs(summary.mirrorGapPct) >= 10;

  return (
    <section className="card flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-hairline px-4 py-2.5">
        <CountryFlag iso2={a.iso2} name={a.name} size="md" />
        <span className="min-w-0 truncate text-sm font-semibold text-ink">{a.name}</span>
        <ArrowLeftRight className="h-3.5 w-3.5 shrink-0 text-ink-muted" aria-hidden />
        <CountryFlag iso2={b.iso2} name={b.name} size="md" />
        <span className="min-w-0 truncate text-sm font-semibold text-ink">{b.name}</span>
        <Link
          href={`/corridor/${a.iso3}/${b.iso3}`}
          title={`Open the ${a.name} - ${b.name} corridor dashboard`}
          className="ml-auto shrink-0 text-ink-muted transition-colors hover:text-ink"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>

      {nothing ? (
        <p className="p-6 text-xs leading-relaxed text-ink-muted">
          Neither country reports bilateral trade with the other. That may mean no trade,
          or simply that neither side publishes at this level - the two are not the same
          and nothing here guesses which applies.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-px bg-hairline">
            <Leg
              label={`${a.name} sells to ${b.name}`}
              value={summary.aToB}
              color={colors.export}
            />
            <Leg
              label={`${b.name} sells to ${a.name}`}
              value={summary.bToA}
              color={colors.import}
            />
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-hairline px-4 py-2 text-2xs">
            <span className="text-ink-muted">
              Balance for {a.iso3}{" "}
              <span
                className={`tabular font-medium ${
                  summary.balance === null
                    ? "text-ink-muted"
                    : summary.balance >= 0
                      ? "text-delta-up"
                      : "text-delta-down"
                }`}
              >
                {usd(summary.balance)}
              </span>
            </span>
            <Tariff label={`${b.iso3} charges ${a.iso3}`} rate={summary.tariffBOnA} mode={mode} />
            <Tariff label={`${a.iso3} charges ${b.iso3}`} rate={summary.tariffAOnB} mode={mode} />
          </div>

          {materialGap && summary.mirrorGapPct !== null && (
            <p className="flex items-start gap-1.5 border-b border-hairline bg-status-warning/5 px-4 py-1.5 text-2xs leading-relaxed text-ink-secondary">
              <TriangleAlert
                className="mt-0.5 h-3 w-3 shrink-0 text-status-warning"
                aria-hidden
              />
              <span>
                The two countries&apos; books disagree by{" "}
                <span className="tabular text-status-warning">
                  {summary.mirrorGapPct > 0 ? "+" : ""}
                  {summary.mirrorGapPct.toFixed(1)}%
                </span>
                . Treat this corridor as a range, not a point.
              </span>
            </p>
          )}

          {summary.buyerSourced && (
            <p className="border-b border-hairline px-4 py-1.5 text-2xs leading-relaxed text-ink-muted">
              One side publishes no export figures, so its direction is the other
              country&apos;s own customs record of the same goods.
            </p>
          )}

          <div className="px-4 py-3">
            <div className="mb-2 flex items-center justify-between text-2xs">
              <span className="flex min-w-0 items-center gap-1">
                <span
                  className="h-2 w-2 shrink-0 rounded-sm"
                  style={{ background: colors.export }}
                  aria-hidden
                />
                <span className="truncate text-ink-secondary">{a.name} sells</span>
              </span>
              <span className="flex min-w-0 items-center gap-1">
                <span className="truncate text-ink-secondary">{b.name} sells</span>
                <span
                  className="h-2 w-2 shrink-0 rounded-sm"
                  style={{ background: colors.import }}
                  aria-hidden
                />
              </span>
            </div>

            {summary.sectors.length === 0 ? (
              <p className="text-2xs text-ink-muted">
                No sector breakdown published for this corridor.
              </p>
            ) : (
              <ul className="space-y-2">
                {summary.sectors.map((row) => (
                  <li key={row.code}>
                    <div className="mb-0.5 flex items-baseline justify-between gap-2 text-2xs">
                      <Link
                        href={`/product/${encodeURIComponent(row.code)}`}
                        className="truncate text-ink-secondary hover:text-ink hover:underline"
                      >
                        {row.name}
                      </Link>
                    </div>
                    {/* Both figures, never the larger of the two. A shared scale makes the
                        smaller corridor's bars a sliver by design - that IS the comparison -
                        so the digits have to carry what the bars cannot at that size. */}
                    <CompareBar
                      exportValue={row.aToB}
                      importValue={row.bToA}
                      scale={scale}
                      height={6}
                      exportLabel={`${a.name} sells ${row.name.toLowerCase()} to ${b.name}`}
                      importLabel={`${b.name} sells ${row.name.toLowerCase()} to ${a.name}`}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Link
            href={`/corridor/${a.iso3}/${b.iso3}`}
            className="mt-auto flex items-center justify-center gap-1.5 border-t border-hairline py-2 text-2xs font-medium text-series-1 transition-colors hover:bg-raised"
          >
            Full corridor dashboard
            <ArrowRight className="h-3 w-3" aria-hidden />
          </Link>
        </>
      )}
    </section>
  );
}

function Leg({ label, value, color }: { label: string; value: number | null; color: string }) {
  return (
    <div className="bg-surface px-4 py-2.5">
      <div className="truncate text-2xs text-ink-muted" title={label}>
        {label}
      </div>
      <div className="tabular mt-1 text-xl font-semibold leading-none" style={{ color }}>
        {usd(value)}
      </div>
    </div>
  );
}

function Tariff({
  label,
  rate,
  mode,
}: {
  label: string;
  rate: number | null;
  mode: "light" | "dark";
}) {
  if (rate === null) {
    return (
      <span className="text-ink-muted">
        {label} <span className="text-ink-muted">not published</span>
      </span>
    );
  }
  const band = tariffBandFor(rate, mode);
  return (
    <span className="flex items-center gap-1 text-ink-muted">
      {label}
      <span
        className="tabular rounded px-1.5 py-0.5 font-semibold"
        style={{ background: band.color, color: band.ink }}
        title={`${band.label} - ${band.blurb}`}
      >
        {pct(rate, 1)}
      </span>
    </span>
  );
}
