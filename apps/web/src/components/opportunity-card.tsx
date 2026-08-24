"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  ChevronDown,
  Package,
  Percent,
  ShoppingCart,
  Star,
  TrendingUp,
} from "lucide-react";
import { sectorColor } from "@/lib/palette";
import { sectorInfo } from "@/lib/sectors";
import { SectorIcon } from "@/components/sector-icon";
import { useTheme } from "./theme";
import { pct, usd } from "@/lib/format";
import { CountryFlag } from "@/components/country-flag";
import { ScoreSpine } from "@/components/charts/score-spine";
import { EstimateTag } from "./ui";
import type { Opportunity } from "@/lib/types";

/**
 * One opportunity, with its arithmetic.
 *
 * The score breakdown is the feature, not supplementary detail. Without it the card is
 * an unverifiable assertion, and V1 explicitly rejects unauditable scoring
 * (docs/DESIGN.md §10). The full working stays behind one click because the SMB persona
 * is overwhelmed by five components at a glance - but the SHAPE of the score is now on
 * the face of the card as a stacked spine, because two cards scoring 61 for completely
 * different reasons used to look identical until both were expanded.
 *
 * The card leads with a SENTENCE, not with the four-figure grid it used to lead with.
 * Four unlabelled percentages in a row is data the reader has to assemble into a claim
 * themselves; the claim is what they came for, and the figures underneath are the
 * evidence for it.
 */

const BANDS = [
  { floor: 70, label: "Strong fit", tone: "text-series-1" },
  { floor: 50, label: "Worth a look", tone: "text-ink" },
  { floor: 0, label: "Early signal", tone: "text-ink-secondary" },
] as const;

export function OpportunityCard({
  opportunity,
  originIso,
  originName,
  rank,
  pinned,
  onPin,
}: {
  opportunity: Opportunity;
  originIso: string;
  originName: string;
  rank?: number;
  /** Undefined until the shortlist has read storage - see `useShortlist`. */
  pinned?: boolean;
  onPin?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { resolved } = useTheme();
  const { evidence } = opportunity;
  const band = BANDS.find((b) => opportunity.score >= b.floor) ?? BANDS[2];
  const hue = sectorColor(opportunity.sector, resolved);
  const sector = sectorInfo(opportunity.sector);

  // The headline restates figures already on the card - it invents nothing. Its job is to
  // put them in the order the claim is actually made in.
  const presence =
    evidence.currentShare === null
      ? `${originName}'s share is not reported.`
      : evidence.currentShare < 0.5
        ? `${originName} supplies almost none of it today.`
        : `${originName} supplies an estimated ${pct(evidence.currentShare, 1)} today.`;

  return (
    <article
      className={`card flex flex-col overflow-hidden transition-shadow hover:shadow-md ${
        pinned ? "ring-1 ring-series-1/60" : ""
      }`}
    >
      {/* Sector identity as a full-width rule, so the colour is visible at card size
          rather than as a 8px dot that reads as a bullet point. */}
      <div className="h-1 w-full" style={{ background: hue }} aria-hidden />

      <div className="flex items-start gap-3 p-4 pb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-2xs text-ink-muted">
            {rank !== undefined && <span className="tabular font-medium">#{rank}</span>}
            <span
              className="inline-flex items-center gap-1.5 truncate rounded-md bg-raised px-1.5 py-0.5 font-medium text-ink-secondary"
              // A card recommending "Stone & glass" is recommending gold and jewellery.
              // The reader has to be able to find that out without leaving the card.
              title={
                sector
                  ? `${sector.name} · HS ${sector.hs}. Includes ${sector.covers.toLowerCase()}.`
                  : opportunity.sectorName
              }
            >
              <SectorIcon code={opportunity.sector} className="h-3 w-3" />
              <span className="truncate">{opportunity.sectorName}</span>
            </span>
          </div>
          <h3 className="mt-1.5 flex items-baseline gap-1.5 text-base font-semibold leading-tight">
            <CountryFlag
              iso2={opportunity.destinationIso2}
              name={opportunity.destinationName}
              size="md"
            />
            <span className="truncate">{opportunity.destinationName}</span>
          </h3>
        </div>

        <div className="flex shrink-0 items-start gap-1.5">
          {onPin && (
            <button
              type="button"
              onClick={onPin}
              aria-pressed={pinned ?? false}
              title={
                pinned
                  ? "Remove from your shortlist"
                  : "Keep this market on your shortlist while you change filters"
              }
              className={`rounded-md p-1 transition-colors hover:bg-raised ${
                pinned ? "text-series-1" : "text-ink-muted hover:text-ink"
              }`}
            >
              <Star className={`h-3.5 w-3.5 ${pinned ? "fill-current" : ""}`} aria-hidden />
              <span className="sr-only">
                {pinned ? "Remove from shortlist" : "Add to shortlist"}
              </span>
            </button>
          )}
          <div className="text-right">
            <div className="tabular text-2xl font-semibold leading-none">{opportunity.score}</div>
            <div className={`mt-1 text-2xs font-medium ${band.tone}`}>{band.label}</div>
          </div>
        </div>
      </div>

      <div className="px-4">
        <ScoreSpine components={opportunity.components} score={opportunity.score} />
      </div>

      {/* Reserved height for two lines: without it a one-line headline and a two-line one
          give neighbouring cards different heights and the grid reads as ragged. */}
      <p className="min-h-[3.25rem] px-4 pt-3 text-xs leading-relaxed text-ink-secondary">
        Imports <span className="tabular font-medium text-ink">{usd(evidence.destinationImports)}</span>{" "}
        of {opportunity.sectorName.toLowerCase()} a year. {presence}
      </p>

      <dl className="mt-3 grid grid-cols-2 gap-px border-y border-hairline bg-hairline">
        <Fact
          icon={<ShoppingCart className="h-3 w-3" aria-hidden />}
          label="Market size"
          value={usd(evidence.destinationImports)}
        />
        <Fact
          icon={<Package className="h-3 w-3" aria-hidden />}
          label="Current share"
          value={evidence.currentShare === null ? "not reported" : pct(evidence.currentShare, 1)}
          estimate
        />
        <Fact
          icon={<TrendingUp className="h-3 w-3" aria-hidden />}
          label={`${originIso} world share`}
          value={
            evidence.originWorldShare === null ? "not reported" : pct(evidence.originWorldShare, 1)
          }
        />
        <Fact
          icon={<Percent className="h-3 w-3" aria-hidden />}
          label="Tariff charged"
          value={evidence.tariff === null ? "not published" : pct(evidence.tariff)}
        />
      </dl>

      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center justify-between px-4 py-2.5 text-2xs font-medium text-ink-secondary transition-colors hover:bg-raised hover:text-ink"
      >
        <span>{open ? "Hide" : "Show"} how this scored {opportunity.score}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {open && (
        <div className="border-t border-hairline bg-plane/50 px-4 py-3">
          <ul className="space-y-2.5">
            {opportunity.components.map((component) => (
              <li key={component.label}>
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="font-medium text-ink-secondary">{component.label}</span>
                  <span className="tabular text-ink-muted">
                    <span className="text-ink">{component.points}</span> / {component.max}
                  </span>
                </div>
                {/* Points against the points that were available - magnitude, so one hue. */}
                <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-series-1/15">
                  <div
                    className="h-full rounded-full bg-series-1"
                    style={{ width: `${(component.points / component.max) * 100}%` }}
                  />
                </div>
                <p className="mt-1 text-2xs leading-relaxed text-ink-muted">{component.reason}</p>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-baseline justify-between border-t border-hairline pt-2 text-xs">
            <span className="font-medium text-ink-secondary">Total</span>
            <span className="tabular font-semibold text-ink">{opportunity.score} / 100</span>
          </div>
        </div>
      )}

      {/* Each link names where it goes. "Corridor / Sector / Country" told the reader the
          shape of the destination page but not which corridor, which sector or which
          country - and on a grid of sixty cards that is the only thing that differs. */}
      <div className="mt-auto grid grid-cols-3 gap-px border-t border-hairline bg-hairline text-2xs">
        <CardLink
          href={`/corridor/${originIso}/${opportunity.destination}`}
          title={`${originIso} to ${opportunity.destinationName}: both directions of this corridor`}
        >
          {originIso} → {opportunity.destination}
        </CardLink>
        <CardLink
          href={`/product/${encodeURIComponent(opportunity.sector)}`}
          title={`The global market for ${opportunity.sectorName}`}
        >
          {opportunity.sectorName}
        </CardLink>
        <CardLink
          href={`/country/${opportunity.destination}`}
          title={`${opportunity.destinationName}'s full trade dashboard`}
        >
          {opportunity.destinationName}
        </CardLink>
      </div>
    </article>
  );
}

function CardLink({
  href,
  title,
  children,
}: {
  href: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      title={title}
      className="flex min-w-0 items-center justify-center gap-1 bg-surface px-2 py-2.5 font-medium text-series-1 transition-colors hover:bg-raised"
    >
      <span className="truncate">{children}</span>
      <ArrowRight className="h-3 w-3 shrink-0" aria-hidden />
    </Link>
  );
}

function Fact({
  icon,
  label,
  value,
  estimate,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  estimate?: boolean;
}) {
  return (
    <div className="bg-surface px-4 py-2.5">
      <dt className="flex items-center gap-1 text-2xs text-ink-muted">
        {icon}
        <span className="truncate">{label}</span>
        {estimate && <EstimateTag />}
      </dt>
      <dd className="tabular mt-0.5 text-sm font-medium text-ink">{value}</dd>
    </div>
  );
}
