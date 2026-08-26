"use client";

import { Plane } from "lucide-react";
import { pct, usd } from "@/lib/format";

export interface AviationYear {
  year: number;
  exports: number | null;
  imports: number | null;
  exportsReported: boolean;
  importsReported: boolean;
}

/**
 * Aircraft and spacecraft, drawn INSIDE the Transport group rather than beside it.
 *
 * HS chapter 88 sits within HS section XVII, which is the `86-89_Transport` group the
 * sixteen already contain. Rendering it as a seventeenth sector would double-count every
 * aircraft - the same failure that overstated India's exports 3.4x when three overlapping
 * WITS classification schemes were summed. So it renders as a nested breakdown, its share
 * OF the parent group is the headline, and nothing on this component can be added to a
 * sector total.
 *
 * It is also the app's first figure from a second source. Chapter detail does not exist
 * in WITS at all (`product/88` is an HTTP 400), so this comes from UN Comtrade, on its
 * own vintage. The card says so, because a reader comparing it against the group figure
 * above is comparing two extractions, not one.
 */
export function AviationInset({
  rows,
  groupExports,
  groupImports,
  countryName,
  source,
  vintage,
}: {
  rows: AviationYear[];
  /** The parent Transport group's own figures, for the share and the containment claim. */
  groupExports: number | null;
  groupImports: number | null;
  countryName: string;
  source: string;
  vintage: string;
}) {
  if (!rows.length) return null;

  // The overlap year first: it is the one that can be checked against the group figure
  // beside it, which is the whole reason it was fetched.
  const base = rows.find((r) => r.exports !== null || r.imports !== null);
  if (!base) return null;
  const latest = rows[rows.length - 1];
  const newer = latest.year > base.year ? latest : null;

  const exportShare =
    base.exports !== null && groupExports ? (base.exports / groupExports) * 100 : null;
  const importShare =
    base.imports !== null && groupImports ? (base.imports / groupImports) * 100 : null;

  const growth =
    newer && newer.exports !== null && base.exports ? (newer.exports / base.exports - 1) * 100 : null;

  // Both sides summed rather than filed is the normal case, so it is stated once as a
  // sentence rather than as a badge on every figure.
  const summed = !base.exportsReported || !base.importsReported;

  return (
    <div className="border-t border-hairline px-4 py-3">
      <h3 className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-ink-muted">
        <Plane className="h-3 w-3" aria-hidden />
        Aircraft &amp; spacecraft
        <span className="tabular font-normal normal-case tracking-normal">· HS chapter 88</span>
      </h3>
      {/* The containment claim is the first thing said, not a footnote, because a reader
          who takes this for a separate sector will add it to the group above it. */}
      <p className="mt-1 text-[10px] leading-relaxed text-ink-muted">
        Part of the Transport group above, not additional to it.
      </p>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <Cell
          label={`${countryName} sells`}
          value={base.exports}
          share={exportShare}
          year={base.year}
        />
        <Cell
          label={`${countryName} buys`}
          value={base.imports}
          share={importShare}
          year={base.year}
        />
      </div>

      {newer && newer.exports !== null && (
        <p className="tabular mt-2 rounded-md border border-hairline bg-plane px-2 py-1.5 text-[10px] leading-relaxed text-ink-muted">
          <span className="font-medium text-ink-secondary">{newer.year}:</span> sells{" "}
          {usd(newer.exports)}
          {growth !== null && (
            <span className={growth >= 0 ? "text-delta-up" : "text-delta-down"}>
              {" "}
              ({growth >= 0 ? "+" : ""}
              {growth.toFixed(1)}% on {base.year})
            </span>
          )}
          {newer.imports !== null && <> · buys {usd(newer.imports)}</>}
        </p>
      )}

      <p className="mt-2 text-[10px] leading-relaxed text-ink-muted">
        {source} · vintage {vintage}. A different source and extraction from the sector
        figures above, so small disagreements between the two are real and are not
        reconciled here.
        {summed && " The chapter total is summed from this country's HS-6 lines rather than filed as a chapter."}
      </p>
    </div>
  );
}

function Cell({
  label,
  value,
  share,
  year,
}: {
  label: string;
  value: number | null;
  share: number | null;
  year: number;
}) {
  return (
    <div className="rounded-md border border-hairline bg-plane px-2.5 py-2">
      <div className="flex items-baseline justify-between gap-1">
        <span className="truncate text-[10px] uppercase tracking-wider text-ink-muted">
          {label}
        </span>
        <span className="tabular shrink-0 text-[10px] text-ink-muted">{year}</span>
      </div>
      <div className="tabular mt-0.5 text-base font-semibold leading-none">
        {value === null ? "-" : usd(value)}
      </div>
      <div className="tabular mt-1 text-[10px] text-ink-muted">
        {share === null ? "share not computable" : `${pct(share, 0)} of the group`}
      </div>
    </div>
  );
}
