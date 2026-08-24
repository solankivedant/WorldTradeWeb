"use client";

import { useTheme } from "@/components/theme";
import { tariffBandFor } from "@/lib/palette";
import { pct } from "@/lib/format";

/**
 * Average applied rate by the partner's region.
 *
 * Length against a shared baseline is still the primary encoding - it is the comparison
 * people read most accurately. Each bar is additionally filled with its own rate BAND,
 * from the same ramp the table and the distribution chart use, so a region that averages
 * into "Elevated" is the same blue as an Elevated row further down. A single flat accent
 * made every region look alike until you read the digits.
 *
 * Every bar is directly labelled and named, so nothing rests on hue.
 *
 * A region average hides a lot (a customs union inside a region can hold one member at
 * zero while its neighbours pay MFN), so the partner count rides alongside each bar
 * rather than being left to a tooltip.
 */

export interface RegionRate {
  region: string;
  average: number;
  count: number;
}

export function TariffRegions({ regions }: { regions: RegionRate[] }) {
  const { resolved } = useTheme();

  if (!regions.length) {
    return <p className="p-4 text-xs text-ink-muted">No partner regions to summarize.</p>;
  }
  const max = Math.max(...regions.map((r) => r.average), 0.1);

  return (
    <ul className="space-y-2.5">
      {regions.map((region) => {
        const band = tariffBandFor(region.average, resolved);
        return (
          <li key={region.region}>
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="flex min-w-0 items-baseline gap-1.5">
                <span className="truncate text-ink-secondary">{region.region}</span>
                <span className="shrink-0 text-2xs text-ink-muted">{band.label}</span>
              </span>
              <span className="tabular shrink-0 text-ink">
                {pct(region.average)}
                <span className="ml-1.5 text-2xs text-ink-muted">{region.count} partners</span>
              </span>
            </div>
            <div
              className="mt-1 h-2.5 w-full overflow-hidden rounded-sm bg-raised"
              title={`${region.region}: ${pct(region.average)} average across ${region.count} partners - ${band.label.toLowerCase()}`}
            >
              <div
                className="h-full rounded-sm"
                style={{
                  width: `${Math.max(1.5, (region.average / max) * 100)}%`,
                  background: band.color,
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
