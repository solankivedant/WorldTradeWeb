import { pct } from "@/lib/format";

/**
 * Average applied rate by the partner's region.
 *
 * One measure, one hue, length against a shared baseline - the comparison people read
 * most accurately. Every bar is directly labelled because there are only a handful of
 * them, which also means no axis is needed.
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
  if (!regions.length) {
    return <p className="p-4 text-xs text-ink-muted">No partner regions to summarize.</p>;
  }
  const max = Math.max(...regions.map((r) => r.average), 0.1);

  return (
    <ul className="space-y-2.5">
      {regions.map((region) => (
        <li key={region.region}>
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="truncate text-ink-secondary">{region.region}</span>
            <span className="tabular shrink-0 text-ink">
              {pct(region.average)}
              <span className="ml-1.5 text-2xs text-ink-muted">{region.count} partners</span>
            </span>
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-sm bg-raised">
            <div
              className="h-full rounded-sm bg-series-1"
              style={{ width: `${Math.max(1.5, (region.average / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
