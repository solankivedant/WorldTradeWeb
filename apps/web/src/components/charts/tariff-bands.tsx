"use client";

import { CircleCheck } from "lucide-react";
import { useTheme } from "@/components/theme";
import { tariffBands } from "@/lib/palette";

/**
 * How a reporter's applied rates are distributed across its partners.
 *
 * Counts by band, as columns. Colour comes from the SAME `tariffBands` ramp the table and
 * the band filter use, keyed by label. It used to be stepped opacities of an accent token
 * instead, which looked close enough but was a different set of colours - so "Elevated"
 * here and "Elevated" three cards down were two different blues, and the reader had no
 * reason to connect them. One rate, one colour, everywhere on the page.
 *
 * Duty-free stays the reserved "good" status colour with an icon and a label, because it
 * is a categorically different state (an agreement is in force, not merely a low number).
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
  const { resolved } = useTheme();
  const palette = tariffBands(resolved);
  const colorFor = (label: string) =>
    palette.find((b) => b.label === label)?.color ?? palette[palette.length - 1].color;

  const max = Math.max(...bands.map((b) => b.count), 1);

  return (
    /* Six columns each carrying a name and a range need about 30rem before the labels
       start breaking mid-word. Below that this scrolls rather than shrinking, which is
       the same answer the wide tables on this page give. */
    <div className="overflow-x-auto">
      <div className="min-w-[30rem]">
        <div className="flex h-40 items-end gap-2">
          {bands.map((band) => {
            const pctOfTotal = total > 0 ? (band.count / total) * 100 : 0;
            return (
              <div key={band.label} className="flex h-full flex-1 flex-col justify-end gap-1.5">
                <div className="tabular text-center text-xs font-medium text-ink">{band.count}</div>
                <div
                  className="w-full rounded-t transition-opacity hover:opacity-80"
                  style={{
                    height: `${Math.max(2, (band.count / max) * 100)}%`,
                    background: colorFor(band.label),
                  }}
                  title={`${band.label} (${band.hint}): ${band.count} partners, ${pctOfTotal.toFixed(0)}% of the schedule`}
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
                {band.dutyFree && (
                  <CircleCheck className="h-2.5 w-2.5 text-status-good" aria-hidden />
                )}
                {band.label}
              </div>
              <div className="text-2xs text-ink-muted">{band.hint}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
