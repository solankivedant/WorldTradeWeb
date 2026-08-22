import { CircleCheck } from "lucide-react";

/**
 * How a reporter's applied rates are distributed across its partners.
 *
 * Counts by band, as columns. The bands are ordered magnitude, so they take a single-hue
 * sequential ramp - stepped opacities of the accent, which keeps it theme-token driven
 * and therefore correct in both themes without a JS colour lookup. Duty-free is the one
 * exception: it is a categorically different state (an agreement is in force, not merely
 * a low number), so it wears the reserved "good" status colour and ships with an icon and
 * a label, never colour alone.
 *
 * Columns rather than a histogram of raw rates because the question readers actually ask
 * is "how many partners get a good deal", and a count per named band answers it directly.
 */

export interface RateBand {
  label: string;
  hint: string;
  count: number;
  dutyFree?: boolean;
}

export function TariffBands({ bands, total }: { bands: RateBand[]; total: number }) {
  const max = Math.max(...bands.map((b) => b.count), 1);
  // Stepped opacities of one hue: further from the surface = higher rate.
  const shades = ["bg-series-1/25", "bg-series-1/45", "bg-series-1/65", "bg-series-1/85", "bg-series-1"];

  return (
    <div>
      <div className="flex h-40 items-end gap-2">
        {bands.map((band, i) => {
          const pctOfTotal = total > 0 ? (band.count / total) * 100 : 0;
          return (
            <div key={band.label} className="flex h-full flex-1 flex-col justify-end gap-1.5">
              <div className="tabular text-center text-xs font-medium text-ink">
                {band.count}
              </div>
              <div
                className={`w-full rounded-t ${
                  band.dutyFree ? "bg-status-good" : shades[Math.min(i - 1, shades.length - 1)]
                }`}
                style={{ height: `${Math.max(2, (band.count / max) * 100)}%` }}
                title={`${band.label}: ${band.count} partners (${pctOfTotal.toFixed(0)}%)`}
                role="img"
                aria-label={`${band.label}: ${band.count} partners`}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex gap-2 border-t border-hairline pt-2">
        {bands.map((band) => (
          <div key={band.label} className="flex-1 text-center">
            <div className="flex items-center justify-center gap-0.5 text-2xs font-medium text-ink-secondary">
              {band.dutyFree && <CircleCheck className="h-2.5 w-2.5 text-status-good" aria-hidden />}
              {band.label}
            </div>
            <div className="text-2xs text-ink-muted">{band.hint}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
