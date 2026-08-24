"use client";

import { useQueryState } from "nuqs";
import { ArrowLeftRight, Filter, Globe2, Layers, RotateCcw, Ruler, X } from "lucide-react";
import { CountryPicker, type PickerCountry } from "@/components/country-picker";
import { SectorIcon } from "@/components/sector-icon";
import { SECTOR_CATALOG, sectorName } from "@/lib/sectors";
import { startRouteProgress } from "@/lib/nav-progress";

/**
 * The explorer's filter bar.
 *
 * Every control writes a URL search param with `shallow: false`, which re-runs the page's
 * server component. The alternative - shipping the corridor cube to the browser and
 * filtering there - would mean sending several megabytes so the reader can narrow it to
 * fifty rows.
 *
 * That also makes every combination of filters a permalink, which is the standing rule for
 * state in this app (docs/DESIGN.md §2).
 *
 * The bar now says what it is DOING as well as offering what it could do. Four controls
 * sitting at their default reading "All sectors / Any country / Any region / Any size"
 * look identical to four controls that have been set, because a select shows its value in
 * the same grey as its placeholder. The chips underneath appear only when something is
 * actually narrowing the page, name it in a sentence, and each one removes just itself -
 * which the single "Clear filters" button could not do.
 */

const MIN_VALUE_STEPS = [
  { value: "", label: "Any size" },
  { value: "1e8", label: "Over $100M" },
  { value: "1e9", label: "Over $1B" },
  { value: "1e10", label: "Over $10B" },
  { value: "5e10", label: "Over $50B" },
];

export function ExploreControls({
  countries,
  regions,
}: {
  countries: PickerCountry[];
  regions: string[];
}) {
  const [sector, setSector] = useQueryState("sector", { defaultValue: "", shallow: false });
  const [country, setCountry] = useQueryState("country", { defaultValue: "", shallow: false });
  const [region, setRegion] = useQueryState("region", { defaultValue: "", shallow: false });
  const [min, setMin] = useQueryState("min", { defaultValue: "", shallow: false });

  const active = Boolean(sector || country || region || min);
  const countryName = countries.find((c) => c.iso3 === country)?.name ?? country;
  const sizeLabel = MIN_VALUE_STEPS.find((s) => s.value === min)?.label ?? min;

  const set = (fn: (v: string) => void) => (value: string) => {
    startRouteProgress();
    fn(value);
  };

  function clearAll() {
    startRouteProgress();
    setSector("");
    setCountry("");
    setRegion("");
    setMin("");
  }

  return (
    <div className="card p-3">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Sector" icon={<Layers className="h-3 w-3" aria-hidden />}>
          <select
            value={sector}
            onChange={(e) => set(setSector)(e.target.value)}
            className="h-9 w-52 rounded-md border border-hairline bg-plane px-2 text-sm focus:border-series-1 focus:outline-none"
          >
            <option value="">All sectors</option>
            {SECTOR_CATALOG.map((s) => (
              <option key={s.code} value={s.code} title={s.covers}>
                {s.name} (HS {s.hs})
              </option>
            ))}
          </select>
        </Field>

        <Field label="Involving country" icon={<Globe2 className="h-3 w-3" aria-hidden />} plain>
          <CountryPicker
            countries={countries}
            value={country}
            onChange={set(setCountry)}
            label="Involving country"
            placeholder="Any country"
            className="w-52"
          />
        </Field>

        <Field label="Touching region" icon={<Filter className="h-3 w-3" aria-hidden />}>
          <select
            value={region}
            onChange={(e) => set(setRegion)(e.target.value)}
            className="h-9 w-52 rounded-md border border-hairline bg-plane px-2 text-sm focus:border-series-1 focus:outline-none"
          >
            <option value="">Any region</option>
            {regions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Corridor size" icon={<Ruler className="h-3 w-3" aria-hidden />}>
          <select
            value={min}
            onChange={(e) => set(setMin)(e.target.value)}
            className="h-9 rounded-md border border-hairline bg-plane px-2 text-sm focus:border-series-1 focus:outline-none"
          >
            {MIN_VALUE_STEPS.map((s) => (
              <option key={s.label} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {active && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-hairline pt-2.5">
          <span className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">
            Showing
          </span>
          {sector && (
            <Chip
              onRemove={() => set(setSector)("")}
              icon={<SectorIcon code={sector} className="h-3 w-3" />}
              label={sectorName(sector)}
            />
          )}
          {country && (
            <Chip
              onRemove={() => set(setCountry)("")}
              icon={<Globe2 className="h-3 w-3" aria-hidden />}
              label={`Involving ${countryName}`}
            />
          )}
          {region && (
            <Chip
              onRemove={() => set(setRegion)("")}
              icon={<Filter className="h-3 w-3" aria-hidden />}
              label={`Touching ${region}`}
            />
          )}
          {min && (
            <Chip
              onRemove={() => set(setMin)("")}
              icon={<Ruler className="h-3 w-3" aria-hidden />}
              label={sizeLabel}
            />
          )}
          <button
            onClick={clearAll}
            className="ml-auto flex items-center gap-1.5 rounded-md border border-hairline px-2 py-1 text-2xs text-ink-secondary transition-colors hover:bg-raised hover:text-ink"
          >
            <RotateCcw className="h-3 w-3" aria-hidden />
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * One active filter, with the same glyph the thing it names wears elsewhere.
 *
 * The icon is never the only cue - the label spells the filter out - so it stays
 * `aria-hidden` and costs a screen reader nothing.
 */
function Chip({
  label,
  icon,
  onRemove,
}: {
  label: string;
  icon?: React.ReactNode;
  onRemove: () => void;
}) {
  return (
    <button
      onClick={onRemove}
      title={`Remove: ${label}`}
      className="flex items-center gap-1 rounded-md border border-series-1/50 bg-series-1/10 px-2 py-1 text-2xs font-medium text-series-1 transition-colors hover:bg-series-1/20"
    >
      {icon}
      {label}
      <X className="h-2.5 w-2.5" aria-hidden />
      <span className="sr-only">Remove this filter</span>
    </button>
  );
}

/**
 * The A-against-B corridor comparison picker.
 *
 * Separate from the filter bar because it answers a different question. The filters
 * narrow a ranked list; this puts two named corridors side by side, which is the
 * "how does this route compare with that one" question the filters cannot express.
 *
 * Four searchable pickers rather than four 190-option selects. This control was the
 * clearest case for the change in the app: assembling one comparison meant four separate
 * scrolls through every country on earth, which is enough friction that the pane below it
 * mostly stayed empty.
 */
export function CorridorComparePicker({ countries }: { countries: PickerCountry[] }) {
  const [a, setA] = useQueryState("a", { defaultValue: "", shallow: false });
  const [b, setB] = useQueryState("b", { defaultValue: "", shallow: false });
  const [c, setC] = useQueryState("c", { defaultValue: "", shallow: false });
  const [d, setD] = useQueryState("d", { defaultValue: "", shallow: false });

  const set = (fn: (v: string) => void) => (value: string) => {
    startRouteProgress();
    fn(value);
  };

  const swap = () => {
    startRouteProgress();
    setA(c);
    setB(d);
    setC(a);
    setD(b);
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Pair label="First connection" from={a} to={b} onFrom={set(setA)} onTo={set(setB)} countries={countries} />
      <button
        onClick={swap}
        disabled={!a && !c}
        title="Swap the two connections"
        className="flex h-9 items-center gap-1.5 rounded-md border border-hairline px-2.5 text-xs text-ink-secondary transition-colors hover:bg-raised hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
      >
        <ArrowLeftRight className="h-3 w-3" aria-hidden />
        Swap
      </button>
      <Pair label="Second connection" from={c} to={d} onFrom={set(setC)} onTo={set(setD)} countries={countries} />
      {(a || b || c || d) && (
        <button
          onClick={() => {
            startRouteProgress();
            setA("");
            setB("");
            setC("");
            setD("");
          }}
          className="flex h-9 items-center gap-1.5 rounded-md border border-hairline px-2.5 text-xs text-ink-secondary transition-colors hover:bg-raised hover:text-ink"
        >
          <RotateCcw className="h-3 w-3" aria-hidden />
          Clear
        </button>
      )}
    </div>
  );
}

function Pair({
  label,
  from,
  to,
  onFrom,
  onTo,
  countries,
}: {
  label: string;
  from: string;
  to: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
  countries: PickerCountry[];
}) {
  return (
    <Field label={label} icon={<ArrowLeftRight className="h-3 w-3" aria-hidden />} plain>
      <div className="flex items-center gap-1.5">
        <CountryPicker
          countries={countries}
          value={from}
          onChange={onFrom}
          label={`${label}: first country`}
          className="w-44"
        />
        <span className="text-xs text-ink-muted">and</span>
        <CountryPicker
          countries={countries}
          value={to}
          onChange={onTo}
          label={`${label}: second country`}
          className="w-44"
        />
      </div>
    </Field>
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
    <Tag className="flex flex-col gap-1">
      <span className="flex items-center gap-1 text-2xs font-semibold uppercase tracking-wider text-ink-muted">
        {icon}
        {label}
      </span>
      {children}
    </Tag>
  );
}
