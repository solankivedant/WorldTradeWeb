"use client";

import { contextMeter } from "@/lib/palette";
import { useTheme } from "@/components/theme";
import { basisLabel, formatIndicator, rankLabel, scalePosition } from "@/lib/indicators";
import type { IndicatorReading } from "@/lib/types";

/**
 * One context reading: the figure, where it sits on its own scale, and what year it is.
 *
 * THE YEAR IS NOT DECORATION. These series stop at different places - services run to
 * 2024, logistics scores to 2022, shipping connectivity to 2021, lead times to 2018 -
 * and every one of them can appear on a page whose trade figures are 2023. A figure
 * shown without its own year invites the reader to assume it shares the year beside it,
 * so the year sits ON the tile, and a reading older than what the source now publishes
 * says so in words.
 *
 * A meter is drawn ONLY where the source documents a scale. Dollars, TEU and days have
 * no "full", and drawing them against an invented maximum would put a country at 90% of
 * a number nobody published - so those render as a figure with a peer comparison and no
 * bar at all.
 *
 * Magnitude is carried by BAR LENGTH against a shared baseline, which is the comparison
 * people read best. Colour carries only polarity on the diverging scales, never
 * magnitude - a ramp along the bar would state the same fact twice.
 */
export function IndicatorMeter({ reading }: { reading: IndicatorReading }) {
  const { resolved } = useTheme();
  const meter = contextMeter(resolved);
  const { spec, value, year, frontier, median, rank, reporting } = reading;

  const position = scalePosition(value, spec);
  const medianPosition = median === null ? null : scalePosition(median, spec);
  // A scale that runs through zero gets a centre-anchored bar; one that starts at its
  // floor gets a bar growing from the left. The catalogue's own range decides which.
  const diverging = Boolean(spec.range && spec.range[0] < 0 && spec.range[1] > 0);
  const ranking = rankLabel(rank, reporting, spec.higher_is_better);
  const stale = frontier !== null && year < frontier;

  return (
    <div
      className="flex flex-col gap-1.5 px-3 py-2.5"
      title={`${spec.label}: ${spec.note} Source indicator ${spec.code}, ${basisLabel(spec.basis)}.`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-2xs font-medium uppercase tracking-wider text-ink-muted">
          {spec.label}
        </span>
        <span className="tabular shrink-0 text-2xs text-ink-muted">{year}</span>
      </div>

      <div className="flex items-baseline gap-1.5">
        <span className="tabular text-lg font-semibold leading-none text-ink">
          {formatIndicator(value, spec.unit)}
        </span>
        {ranking && <span className="text-2xs text-ink-muted">{ranking}</span>}
      </div>

      {position === null ? (
        <p className="text-2xs leading-relaxed text-ink-muted">
          {median === null
            ? "No peer comparison available."
            : `Median across reporting countries: ${formatIndicator(median, spec.unit)}.`}
        </p>
      ) : (
        <Meter
          position={position}
          medianPosition={medianPosition}
          diverging={diverging}
          color={
            diverging ? (value < 0 ? meter.negative : meter.positive) : meter.fill
          }
          label={`${formatIndicator(value, spec.unit)} on a scale of ${spec.range?.[0]} to ${spec.range?.[1]}`}
          scaleLow={spec.range?.[0] ?? 0}
          scaleHigh={spec.range?.[1] ?? 1}
          median={median}
          unit={spec.unit}
        />
      )}

      {stale && (
        <p className="text-2xs leading-relaxed text-ink-muted">
          Newest year this country reports. The series itself now runs to {frontier}.
        </p>
      )}
    </div>
  );
}

function Meter({
  position,
  medianPosition,
  diverging,
  color,
  label,
  scaleLow,
  scaleHigh,
  median,
  unit,
}: {
  position: number;
  medianPosition: number | null;
  diverging: boolean;
  color: string;
  label: string;
  scaleLow: number;
  scaleHigh: number;
  median: number | null;
  unit: IndicatorReading["spec"]["unit"];
}) {
  // On a diverging scale the bar grows out of the midpoint; on a bounded one it grows
  // from the floor. Both are expressed as a left offset and a width so there is one
  // geometry to reason about.
  const left = diverging ? Math.min(position, 0.5) : 0;
  const width = diverging ? Math.abs(position - 0.5) : position;

  return (
    <div className="flex flex-col gap-1">
      <div
        className="relative h-2 w-full overflow-hidden rounded-full bg-hairline/70"
        role="img"
        aria-label={label}
      >
        <div
          className="absolute inset-y-0 rounded-full"
          style={{
            left: `${left * 100}%`,
            width: `${Math.max(width * 100, 1.5)}%`,
            background: color,
          }}
        />
        {diverging && (
          // The neutral midpoint, drawn as a line rather than a colour. It is where the
          // world average sits by construction, so the bar's side IS the finding.
          <span
            className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-baseline"
            aria-hidden
          />
        )}
        {medianPosition !== null && (
          <span
            className="absolute -inset-y-0.5 w-0.5 rounded-full bg-ink/45"
            style={{ left: `calc(${medianPosition * 100}% - 1px)` }}
            title={median === null ? undefined : `Median: ${formatIndicator(median, unit)}`}
            aria-hidden
          />
        )}
      </div>
      <div className="tabular flex justify-between text-[10px] text-ink-muted">
        <span>{scaleLow}</span>
        {median !== null && <span>median {formatIndicator(median, unit)}</span>}
        <span>{scaleHigh}</span>
      </div>
    </div>
  );
}
