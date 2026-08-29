"use client";

import Link from "next/link";
import { ArrowDownToLine, ArrowUpFromLine, Package } from "lucide-react";
import { flowColors } from "@/lib/palette";
import { useTheme } from "@/components/theme";
import { sectorInfo } from "@/lib/sectors";
import { SectorIcon } from "@/components/sector-icon";
import { pct, usd } from "@/lib/format";
import { CaveatList } from "@/components/ui";
import type { LeadingSector } from "@/lib/pairing";

/**
 * What this country sells most, and what it buys most - stated, not left to be decoded.
 *
 * Every screen already carried this information inside a sixteen-row sector mix, which
 * means the reader had to compare bar lengths across two directions to arrive at a
 * sentence the app could simply have written. The mix answers "how is the trade spread";
 * this answers "what is it, mostly", and those are different questions. The mix stays
 * exactly where it was - this sits above it.
 *
 * Both directions or neither, like everything else here. "Fuels" as a country's biggest
 * export reads as an oil economy until the biggest import is also fuels, at which point
 * it reads as a refiner.
 *
 * The HS chapters and the contents line are the reason this is worth building at all. A
 * group name on its own misleads: Switzerland's second sector is "Stone & glass", which
 * is the group holding gold and diamonds, and a reader seeing the label alone would
 * conclude something false about the Swiss economy. Naming the chapters and listing what
 * is inside them turns a label into a fact the reader can actually use.
 *
 * It is NOT an individual product line, and the component says so rather than letting the
 * reader assume otherwise. HS-6 detail is not in this dataset at all (docs/PRD.md §10).
 */
export function TopSectors({
  exports,
  imports,
  reporterName,
  variant = "card",
  linkSectors = true,
  title,
  shareOf,
  exportHeading,
  importHeading,
}: {
  exports: LeadingSector | null;
  imports: LeadingSector | null;
  /** Named on both sides, because a bare "Exports" does not say whose. */
  reporterName: string;
  /** Card heading. Defaults to naming the reporter. */
  title?: string;
  /**
   * Override the per-side headings for a context where "sells most" is ambiguous.
   *
   * On a corridor there are two countries and the trade is between THEM, so "India sells
   * most" would be read as India's exports to the world. A caller in that context must
   * pass "India sells to China most" instead.
   */
  exportHeading?: string;
  importHeading?: string;
  /**
   * What the share is a percentage OF, worded for the caller's context.
   *
   * Defaults to "what it sells" / "what it buys", which is right for a country and wrong
   * for a corridor, where the denominator is one direction of one route rather than a
   * country's whole trade.
   */
  shareOf?: { exports: string; imports: string };
  /** `panel` is the 340px floating map panel; `card` is a full-width page card. */
  variant?: "panel" | "card";
  /** Off inside the map panel, where a navigation would throw away the map selection. */
  linkSectors?: boolean;
}) {
  if (!exports && !imports) return null;

  const panel = variant === "panel";

  return (
    <div className={panel ? "" : "card p-4"}>
      {!panel && (
        <h2 className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-ink-muted">
          <Package className="h-3 w-3" aria-hidden />
          {title ?? `What ${reporterName} trades most`}
        </h2>
      )}
      <div className={`grid gap-2 ${panel ? "" : "mt-3 sm:grid-cols-2"}`}>
        <Side
          leading={exports}
          direction="export"
          reporterName={reporterName}
          heading={exportHeading}
          shareOf={shareOf?.exports}
          panel={panel}
          linkSectors={linkSectors}
        />
        <Side
          leading={imports}
          direction="import"
          reporterName={reporterName}
          heading={importHeading}
          shareOf={shareOf?.imports}
          panel={panel}
          linkSectors={linkSectors}
        />
      </div>
      <div className={panel ? "mt-2" : "mt-3"}>
        <CaveatList
          dense
          items={[
            "These are HS section groups, not single product lines - a group spans whole chapters of the Harmonized System, and the contents shown are examples rather than a full list.",
            <>
              Shares are of the {exports?.ofGroups ?? imports?.ofGroups ?? 16} groups in this
              direction, read from the sector cube - a different aggregation from the headline
              figures above, and the two are never scaled to match.
            </>,
          ]}
        />
      </div>
    </div>
  );
}

function Side({
  leading,
  direction,
  reporterName,
  heading: headingOverride,
  shareOf,
  panel,
  linkSectors,
}: {
  leading: LeadingSector | null;
  direction: "export" | "import";
  reporterName: string;
  heading?: string;
  shareOf?: string;
  panel: boolean;
  linkSectors: boolean;
}) {
  const { resolved } = useTheme();
  const colors = flowColors(resolved);
  const selling = direction === "export";
  const tone = selling ? colors.export : colors.import;
  const Icon = selling ? ArrowUpFromLine : ArrowDownToLine;
  const heading =
    headingOverride ?? (selling ? `${reporterName} sells most` : `${reporterName} buys most`);
  const base = shareOf ?? (selling ? `what ${reporterName} sells` : `what ${reporterName} buys`);

  if (!leading) {
    return (
      <div className="rounded-lg border border-hairline bg-plane/50 px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-2xs text-ink-muted">
          <Icon className="h-3 w-3 shrink-0" style={{ color: tone }} aria-hidden />
          {heading}
        </div>
        {/* Absent is not zero. A country that files no product breakdown gets a stated
            gap, never a "-" that reads as "nothing". */}
        <p className="mt-1 text-xs text-ink-secondary">Not reported</p>
        <p className="mt-0.5 text-2xs text-ink-muted">
          No product breakdown published for this direction.
        </p>
      </div>
    );
  }

  const info = sectorInfo(leading.code);
  const name = (
    <span className="flex min-w-0 items-baseline gap-1.5">
      <SectorIcon code={leading.code} className="h-3.5 w-3.5 translate-y-px" />
      <span className="truncate font-semibold text-ink">{leading.name}</span>
      {info && <span className="tabular shrink-0 text-2xs text-ink-muted">HS {info.hs}</span>}
    </span>
  );

  return (
    <div className="rounded-lg border border-hairline bg-plane/50 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-2xs text-ink-muted">
        <Icon className="h-3 w-3 shrink-0" style={{ color: tone }} aria-hidden />
        {heading}
      </div>

      <div className={`mt-1 ${panel ? "text-xs" : "text-sm"}`}>
        {linkSectors ? (
          <Link
            href={`/product/${encodeURIComponent(leading.code)}`}
            title={`The global market for ${leading.name}`}
            className="hover:underline"
          >
            {name}
          </Link>
        ) : (
          name
        )}
      </div>

      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="tabular text-sm font-semibold" style={{ color: tone }}>
          {usd(leading.value)}
        </span>
        <span className="tabular text-2xs text-ink-muted">
          {pct(leading.share)} of {base}
        </span>
      </div>

      {/* Share of the direction, as one magnitude bar in that direction's own hue. No
          scale beyond 100 is possible here, so the track IS the whole of that side. */}
      <div
        className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-hairline/70"
        role="img"
        aria-label={`${leading.name} is ${pct(leading.share)} of ${base}.`}
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.max(2, Math.min(100, leading.share))}%`, background: tone }}
        />
      </div>

      {info && (
        <p className="mt-1.5 text-2xs leading-relaxed text-ink-muted">
          Includes {info.covers.toLowerCase()}.
        </p>
      )}
    </div>
  );
}
