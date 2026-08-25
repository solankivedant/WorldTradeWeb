"use client";

import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";

import { CompareBar, CompareLegend } from "@/components/charts/compare-bar";
import { basisLabel, formatIndicator } from "@/lib/indicators";
import { usd } from "@/lib/format";
import type { IndicatorReading } from "@/lib/types";

export interface FlowPairRow {
  label: string;
  /** Money leaving the rest of the world for this country, or the reverse. */
  outward: IndicatorReading | null;
  inward: IndicatorReading | null;
  outLabel: string;
  inLabel: string;
}

/**
 * Money that moves in two directions, drawn the way goods trade is drawn.
 *
 * Services, investment and remittances are all directional pairs, so they get the same
 * shared centre line, the same green/red identity and the same arrows as every other
 * paired figure in this product. The whole reason that encoding is app-wide is that a
 * reader should not have to relearn it one screen later - and the reason the pair is
 * never split is that a large number on one side reads as a good number until the other
 * side sits beside it.
 *
 * NEGATIVES ARE NOT A ROUNDING PROBLEM. Direct investment is a NET flow: when foreign
 * investors pull more out than they put in for a year, the published figure is below
 * zero. A bar cannot be shorter than nothing, so a negative side is not drawn as a
 * stunted bar - it is stated in words, because "net withdrawal" is a different fact from
 * "a small inflow" and the two must not look alike.
 */
export function FlowPair({
  rows,
  countryName,
  className = "",
}: {
  rows: FlowPairRow[];
  /** Named in the legend. A bare "in" and "out" does not say whose money it is. */
  countryName: string;
  className?: string;
}) {
  // One scale across every row, so bar length is comparable down the list. Negatives are
  // measured by magnitude here: a -$4B withdrawal is as big an event as a +$4B inflow.
  const scale = Math.max(
    ...rows.flatMap((row) => [
      Math.abs(row.outward?.value ?? 0),
      Math.abs(row.inward?.value ?? 0),
    ]),
    1,
  );

  return (
    <div className={className}>
      {/* Every row here is money crossing the same border in the same two directions -
          services sold abroad, remittances sent home and investment received all arrive -
          so one legend covers the card, and it names the country rather than leaving
          "in" and "out" to be read off the arrows alone. */}
      <CompareLegend
        className="px-3 pb-2"
        exportLabel={`Money into ${countryName}`}
        importLabel={`Money out of ${countryName}`}
      />
      <ul>
        {rows.map((row) => (
          <FlowRow key={row.label} row={row} scale={scale} />
        ))}
      </ul>
    </div>
  );
}

/**
 * The two signed figures, stated rather than drawn.
 *
 * Length cannot express a negative, and every alternative that keeps the bar lies: a
 * clamped bar prints a zero that is not the figure, and a mirrored bar makes a withdrawal
 * look like an inflow of the same size.
 */
function NetFlows({ row }: { row: FlowPairRow }) {
  const sides = [
    { reading: row.outward, label: row.outLabel, Icon: ArrowUpFromLine },
    { reading: row.inward, label: row.inLabel, Icon: ArrowDownToLine },
  ];
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-hairline bg-hairline">
      {sides.map(({ reading, label, Icon }) => (
        <div key={label} className="bg-surface px-2.5 py-1.5">
          <dt className="flex items-center gap-1 text-2xs text-ink-muted">
            <Icon className="h-2.5 w-2.5 shrink-0" aria-hidden />
            <span className="truncate">{label}</span>
          </dt>
          <dd className="tabular mt-0.5 text-sm font-semibold text-ink">
            {reading ? formatIndicator(reading.value, reading.spec.unit) : "not reported"}
            {reading && reading.value < 0 && (
              <span className="ml-1.5 text-2xs font-normal text-ink-muted">net withdrawal</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function FlowRow({ row, scale }: { row: FlowPairRow; scale: number }) {
  const { outward, inward } = row;
  if (!outward && !inward) return null;

  // Years are per series and can differ between the two sides of one row.
  const years = [outward?.year, inward?.year].filter((y): y is number => y !== undefined);
  const yearLabel =
    years.length === 0
      ? null
      : years[0] === years[years.length - 1]
        ? String(years[0])
        : `${Math.min(...years)}-${Math.max(...years)}`;

  const negative = [outward, inward].filter((r) => r && r.value < 0) as IndicatorReading[];
  const basis = outward?.spec.basis ?? inward?.spec.basis;

  return (
    <li className="border-b border-hairline/60 px-3 py-2.5 last:border-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-xs font-medium text-ink">{row.label}</span>
        <span className="tabular shrink-0 text-2xs text-ink-muted">{yearLabel}</span>
      </div>

      <div className="mt-1.5">
        {negative.length > 0 ? (
          // A year that ran backwards gets its own treatment rather than a clamped bar.
          // Feeding CompareBar a floored value printed "$0" in the gutter beside a real
          // figure of -$9.4B, which is not a smaller number - it is a different one, and
          // this product does not let zero stand in for anything it is not.
          <NetFlows row={row} />
        ) : (
          <CompareBar
            exportValue={outward ? outward.value : null}
            importValue={inward ? inward.value : null}
            scale={scale}
            exportLabel={`${row.outLabel}: ${outward ? usd(outward.value) : "not reported"}`}
            importLabel={`${row.inLabel}: ${inward ? usd(inward.value) : "not reported"}`}
          />
        )}
      </div>

      {/* The bar carries no words, so the sides are named under it. The net-flow block
          names them itself, and repeating them there says the same thing twice. */}
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-2xs text-ink-muted">
        {negative.length === 0 && (
          <>
            <span className="flex items-center gap-1">
              <ArrowUpFromLine className="h-2.5 w-2.5" aria-hidden />
              {row.outLabel}
            </span>
            <span className="flex items-center gap-1">
              <ArrowDownToLine className="h-2.5 w-2.5" aria-hidden />
              {row.inLabel}
            </span>
          </>
        )}
        {basis && <span>{basisLabel(basis)}</span>}
      </div>

      {negative.length > 0 && (
        <p className="mt-1.5 text-2xs leading-relaxed text-ink-muted">
          {negative.length === 2 ? "Both sides were" : "One side was"} negative in{" "}
          {negative[0].year}: direct investment is a NET flow, so a figure below zero means
          investors took more out over the year than they put in. There is no bar to draw
          for a withdrawal, and it is not a small inflow.
        </p>
      )}
    </li>
  );
}
