"use client";

import { useQueryState } from "nuqs";
import { ArrowLeftRight, Filter, Globe2, Layers, RotateCcw, Ruler } from "lucide-react";
import { SECTOR_CATALOG } from "@/lib/sectors";
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
  countries: { iso3: string; name: string }[];
  regions: string[];
}) {
  const [sector, setSector] = useQueryState("sector", { defaultValue: "", shallow: false });
  const [country, setCountry] = useQueryState("country", { defaultValue: "", shallow: false });
  const [region, setRegion] = useQueryState("region", { defaultValue: "", shallow: false });
  const [min, setMin] = useQueryState("min", { defaultValue: "", shallow: false });

  const active = Boolean(sector || country || region || min);

  const set = (fn: (v: string) => void) => (value: string) => {
    startRouteProgress();
    fn(value);
  };

  return (
    <div className="card flex flex-wrap items-end gap-3 p-3">
      <Field label="Sector" icon={<Layers className="h-3 w-3" aria-hidden />}>
        <select
          value={sector}
          onChange={(e) => set(setSector)(e.target.value)}
          className="h-9 w-52 rounded-md border border-hairline bg-plane px-2 text-sm focus:border-series-1 focus:outline-none"
        >
          <option value="">All sectors</option>
          {SECTOR_CATALOG.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Involving country" icon={<Globe2 className="h-3 w-3" aria-hidden />}>
        <select
          value={country}
          onChange={(e) => set(setCountry)(e.target.value)}
          className="h-9 w-52 rounded-md border border-hairline bg-plane px-2 text-sm focus:border-series-1 focus:outline-none"
        >
          <option value="">Any country</option>
          {countries.map((c) => (
            <option key={c.iso3} value={c.iso3}>
              {c.name}
            </option>
          ))}
        </select>
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

      {active && (
        <button
          onClick={() => {
            startRouteProgress();
            setSector("");
            setCountry("");
            setRegion("");
            setMin("");
          }}
          className="flex h-9 items-center gap-1.5 rounded-md border border-hairline px-2.5 text-xs text-ink-secondary transition-colors hover:bg-raised hover:text-ink"
        >
          <RotateCcw className="h-3 w-3" aria-hidden />
          Clear filters
        </button>
      )}
    </div>
  );
}

/**
 * The A-against-B corridor comparison picker.
 *
 * Separate from the filter bar because it answers a different question. The filters
 * narrow a ranked list; this puts two named corridors side by side, which is the
 * "how does this route compare with that one" question the filters cannot express.
 */
export function CorridorComparePicker({
  countries,
}: {
  countries: { iso3: string; name: string }[];
}) {
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
  countries: { iso3: string; name: string }[];
}) {
  return (
    <Field label={label} icon={<ArrowLeftRight className="h-3 w-3" aria-hidden />}>
      <div className="flex items-center gap-1.5">
        <select
          value={from}
          onChange={(e) => onFrom(e.target.value)}
          aria-label={`${label}: first country`}
          className="h-9 w-44 rounded-md border border-hairline bg-plane px-2 text-sm focus:border-series-1 focus:outline-none"
        >
          <option value="">Pick a country</option>
          {countries.map((c) => (
            <option key={c.iso3} value={c.iso3}>
              {c.name}
            </option>
          ))}
        </select>
        <span className="text-xs text-ink-muted">and</span>
        <select
          value={to}
          onChange={(e) => onTo(e.target.value)}
          aria-label={`${label}: second country`}
          className="h-9 w-44 rounded-md border border-hairline bg-plane px-2 text-sm focus:border-series-1 focus:outline-none"
        >
          <option value="">Pick a country</option>
          {countries.map((c) => (
            <option key={c.iso3} value={c.iso3}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
    </Field>
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
    <label className="flex flex-col gap-1">
      <span className="flex items-center gap-1 text-2xs font-semibold uppercase tracking-wider text-ink-muted">
        {icon}
        {label}
      </span>
      {children}
    </label>
  );
}
