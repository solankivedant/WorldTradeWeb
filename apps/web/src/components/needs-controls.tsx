"use client";

import { useQueryState } from "nuqs";
import { ArrowDownToLine, ArrowUpFromLine, Globe2 } from "lucide-react";
import { CountryPicker, type PickerCountry } from "@/components/country-picker";
import { Segmented } from "@/components/segmented";
import { startRouteProgress } from "@/lib/nav-progress";

/**
 * The needs page's controls.
 *
 * All three write URL params with `shallow: false`, because all three change which rows
 * exist: a different country is a different dataset, and the lens and the sort decide
 * which side of the balance is kept and in what order. Selecting a SECTOR is the opposite
 * case and lives inside `NeedsExplorer` with `shallow: true` - it only picks which of the
 * already-rendered detail panels is on screen.
 *
 * The lens is a `Segmented`, not a filter dropdown, on purpose: it swaps between two
 * complete views of the same country rather than narrowing one. That distinction is the
 * reason `Segmented` exists (see its own note) and a reader who cannot tell "this changes
 * the data" from "this changes the framing" ends up trusting neither.
 */
export function NeedsControls({
  countries,
  country,
  lens,
  sort,
}: {
  countries: PickerCountry[];
  country: string;
  lens: "needs" | "supplies";
  sort: string;
}) {
  const [, setCountry] = useQueryState("country", { defaultValue: "", shallow: false });
  const [, setLens] = useQueryState("lens", { defaultValue: "", shallow: false });
  const [, setSort] = useQueryState("sort", { defaultValue: "", shallow: false });

  const set = (fn: (value: string) => void) => (value: string) => {
    startRouteProgress();
    fn(value);
  };

  return (
    <div className="card flex flex-wrap items-end gap-x-4 gap-y-3 p-3">
      <label className="flex w-full min-w-0 flex-col gap-1 sm:w-auto">
        <span className="flex items-center gap-1 text-2xs font-semibold uppercase tracking-wider text-ink-muted">
          <Globe2 className="h-3 w-3" aria-hidden />
          Country
        </span>
        <CountryPicker
          countries={countries}
          value={country}
          onChange={set(setCountry)}
          label="Country"
          className="w-full sm:w-56"
        />
      </label>

      <div className="flex flex-col gap-1">
        <span className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">
          Side of the balance
        </span>
        <Segmented
          label="Side of the balance"
          value={lens}
          onChange={(id) => set(setLens)(id === "needs" ? "" : id)}
          options={[
            {
              id: "needs" as const,
              label: "Buys more",
              Icon: ArrowDownToLine,
              hint: "Groups it buys more of than it sells",
            },
            {
              id: "supplies" as const,
              label: "Sells more",
              Icon: ArrowUpFromLine,
              hint: "Groups it sells more of than it buys",
            },
          ]}
        />
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">
          Rank by
        </span>
        <select
          value={sort}
          onChange={(e) => set(setSort)(e.target.value === "gap" ? "" : e.target.value)}
          className="h-9 rounded-md border border-hairline bg-plane px-2 text-sm focus:border-series-1 focus:outline-none"
        >
          {/* Two genuinely different questions, which is why both ship. Dollar size ranks
              big economies and big groups first; coverage finds the deepest structural
              reliance whatever the group is worth. */}
          <option value="gap">Size of the gap</option>
          <option value="coverage">Thinnest coverage</option>
          <option value="share">Share of the import bill</option>
        </select>
      </label>
    </div>
  );
}
