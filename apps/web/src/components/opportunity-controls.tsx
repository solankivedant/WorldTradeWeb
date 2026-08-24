"use client";

import { useQueryState } from "nuqs";
import { Globe2, Layers, Ruler, RotateCcw } from "lucide-react";
import { CountryPicker, type PickerCountry } from "@/components/country-picker";
import { startRouteProgress } from "@/lib/nav-progress";

/**
 * The controls that RE-RUN the engine, and only those.
 *
 * Each of these three re-scores every country on earth against a new origin, sector or
 * size floor, so each is a server round-trip and each belongs in the URL. Everything that
 * merely narrows a result already on screen lives with the results instead, in
 * `OpportunityBoard` - the reader can see which controls cost a reload and which do not,
 * because they are in different places on the page.
 *
 * Coverage is a filter like any other, and it belongs here rather than buried in the
 * engine's constants: an $80M market is genuinely interesting to a small exporter and
 * noise to a large one, and only the reader knows which they are. Leaving it hard-wired
 * meant a whole tier of countries could never appear on this page at all.
 *
 * The origin is a searchable picker rather than a `select`. It is the single most
 * consequential control on the page and it had 190 options in it; scrolling to Vietnam
 * past every country on earth is not a way to start a search.
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
  countries: PickerCountry[];
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
      {/* Not wrapped in a `label`: the picker is a button, and a label whose control is a
          button hijacks the click into a second toggle. It carries its own aria-label. */}
      <Field label="Exporting from" icon={<Globe2 className="h-3 w-3" aria-hidden />} plain>
        <CountryPicker
          countries={countries}
          value={origin}
          onChange={(iso3) => iso3 && change(setOrigin, iso3)}
          label="Exporting from"
          // There is no "no origin" state - the whole page is scored from one country.
          allowClear={false}
          className="w-full"
        />
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
        These three re-run the engine. Only sectors the origin already exports above a
        minimum threshold appear - it will not suggest exporting something a country has
        never made.
      </p>
    </div>
  );
}

function Field({
  label,
  icon,
  plain,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  /** Render a div rather than a label, for controls that are buttons rather than inputs. */
  plain?: boolean;
  children: React.ReactNode;
}) {
  const Tag = plain ? "div" : "label";
  return (
    <Tag className="flex min-w-[13rem] flex-col gap-1">
      <span className="flex items-center gap-1 text-2xs font-semibold uppercase tracking-wider text-ink-muted">
        {icon}
        {label}
      </span>
      {children}
    </Tag>
  );
}
