"use client";

import { useQueryState } from "nuqs";
import { Globe2, Layers, Ruler, RotateCcw } from "lucide-react";
import { startRouteProgress } from "@/lib/nav-progress";

/**
 * Filters sit in one row above the results, and every one of them is in the URL.
 *
 * Coverage is a filter like any other, and it belongs here rather than buried in the
 * engine's constants: an $80M market is genuinely interesting to a small exporter and
 * noise to a large one, and only the reader knows which they are. Leaving it hard-wired
 * meant a whole tier of countries could never appear on this page at all.
 *
 * These selects trigger a server round-trip (`shallow: false`), so each one starts the
 * route progress bar - a select that silently re-scores 190 countries looks broken.
 */
export function OpportunityControls({
  countries,
  sectors,
  floors,
  origin,
  sector,
  floor,
  isDefault,
}: {
  countries: { iso3: string; name: string }[];
  sectors: { code: string; name: string }[];
  floors: { id: string; label: string }[];
  origin: string;
  sector: string;
  floor: string;
  isDefault: boolean;
}) {
  const [, setOrigin] = useQueryState("origin", { defaultValue: "IND", shallow: false });
  const [, setSector] = useQueryState("sector", { defaultValue: "", shallow: false });
  const [, setFloor] = useQueryState("floor", { defaultValue: "", shallow: false });

  function change<T>(setter: (value: T) => unknown, value: T) {
    startRouteProgress();
    setter(value);
  }

  return (
    <div className="card flex flex-wrap items-end gap-x-4 gap-y-3 p-3">
      <Field label="Exporting from" icon={<Globe2 className="h-3 w-3" aria-hidden />}>
        <select
          value={origin}
          onChange={(e) => change(setOrigin, e.target.value)}
          className="h-9 w-full rounded-md border border-hairline bg-plane px-2 text-sm focus:border-series-1 focus:outline-none"
        >
          {countries.map((c) => (
            <option key={c.iso3} value={c.iso3}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Sector" icon={<Layers className="h-3 w-3" aria-hidden />}>
        <select
          value={sector}
          onChange={(e) => change(setSector, e.target.value || null)}
          className="h-9 w-full rounded-md border border-hairline bg-plane px-2 text-sm focus:border-series-1 focus:outline-none"
        >
          <option value="">All sectors this country exports</option>
          {sectors.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Market coverage" icon={<Ruler className="h-3 w-3" aria-hidden />}>
        <select
          value={floor}
          onChange={(e) => change(setFloor, e.target.value)}
          className="h-9 w-full rounded-md border border-hairline bg-plane px-2 text-sm focus:border-series-1 focus:outline-none"
        >
          {floors.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </Field>

      {!isDefault && (
        <button
          onClick={() => {
            startRouteProgress();
            setSector(null);
            setFloor(null);
          }}
          className="flex h-9 items-center gap-1.5 rounded-md border border-hairline px-3 text-xs text-ink-secondary transition-colors hover:bg-raised hover:text-ink"
        >
          <RotateCcw className="h-3 w-3" aria-hidden />
          Reset filters
        </button>
      )}

      <p className="ml-auto max-w-xs text-2xs leading-relaxed text-ink-muted">
        Only sectors the origin already exports above a minimum threshold appear - the
        engine will not suggest exporting something a country has never made.
      </p>
    </div>
  );
}

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="flex min-w-[13rem] flex-col gap-1">
      <span className="flex items-center gap-1 text-2xs font-semibold uppercase tracking-wider text-ink-muted">
        {icon}
        {label}
      </span>
      {children}
    </label>
  );
}
