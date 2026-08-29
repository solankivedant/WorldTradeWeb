import { Info } from "lucide-react";

import { FlowPair, type FlowPairRow } from "@/components/charts/flow-pair";
import { IndicatorMeter } from "@/components/charts/indicator-meter";
import { Card, CaveatList } from "@/components/ui";
import { familyIcon } from "@/lib/indicators";
import type { IndicatorReading } from "@/lib/types";

/**
 * Everything about a country that its customs records do not measure.
 *
 * This section exists because the goods figures above it are not the whole answer and
 * quietly imply that they are. Ireland's and India's goods numbers understate them badly;
 * for several economies remittances are larger than any single export sector; and a duty
 * rate says nothing about whether the border actually clears.
 *
 * THE ONE RULE THIS SECTION ENFORCES: none of these figures may be added to a goods
 * total, and the page has to say so where a reader would otherwise assume otherwise.
 * Services are balance-of-payments data and goods are customs data - two different
 * measurement systems, produced by different agencies, reconciling to different
 * aggregates. So the section is separated from the trade figures by its own heading, its
 * own explanation, and a per-row basis label.
 *
 * Years are per series and are printed per figure, because they genuinely disagree: the
 * services figures reach 2024 while the goods figures beside them stop at 2023, and the
 * lead times stop in 2018.
 */
export function CountryContext({
  families,
  readings,
  countryName,
  reportedNote,
}: {
  families: { id: string; label: string; blurb: string }[];
  readings: Record<string, IndicatorReading[]>;
  countryName: string;
  /**
   * Said only on the mirror page, where everything ABOVE this section is estimated and
   * everything in it is not. Silence there would leave a reader to assume the page has
   * one provenance throughout, which is the assumption the mirror rules exist to prevent.
   */
  reportedNote?: string;
}) {
  const present = families.filter((family) => (readings[family.id] ?? []).length > 0);
  if (present.length === 0) return null;

  const money = present.filter((f) => f.id === "services" || f.id === "finance");
  const scored = present.filter((f) => f.id !== "services" && f.id !== "finance");

  return (
    <section className="mt-5">
      <h2 className="text-sm font-semibold tracking-tight text-ink">
        Beyond goods: what the customs figures do not measure
      </h2>
      <p className="mt-1 max-w-3xl text-xs leading-relaxed text-ink-secondary">
        Services sold across borders, money moved by investors and workers, and the
        conditions goods actually travel under - none of this is customs data, and none of
        it can be added to the trade figures above.
      </p>
      <div className="mt-2 max-w-3xl">
        <CaveatList
          dense
          items={[
            <>
              Services and financial flows are balance-of-payments statistics; the
              logistics and governance scores are surveys and composites - a different
              measurement system from the customs-recorded goods trade above, so the two
              are never summed.
            </>,
            <>
              Each figure below carries the year it belongs to rather than the trade
              year beside it, because these series do not all end where the trade data
              does or where each other does.
            </>,
          ]}
        />
      </div>
      {reportedNote && (
        <p className="mt-2 max-w-3xl rounded-md border border-hairline bg-raised/40 px-3 py-2 text-xs leading-relaxed text-ink-secondary">
          {reportedNote}
        </p>
      )}

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {money.map((family) => (
          <Card
            key={family.id}
            title={family.label}
            icon={<FamilyGlyph family={family.id} />}
          >
            <p className="px-4 pb-2 text-2xs leading-relaxed text-ink-muted">{family.blurb}</p>
            <FlowPair
              rows={moneyRows(family.id, readings[family.id] ?? [], countryName)}
              countryName={countryName}
            />
          </Card>
        ))}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {scored.map((family) => (
          <Card
            key={family.id}
            title={family.label}
            icon={<FamilyGlyph family={family.id} />}
          >
            <p className="px-4 pb-1 text-2xs leading-relaxed text-ink-muted">{family.blurb}</p>
            <div className="divide-y divide-hairline/60 px-1 pb-2">
              {(readings[family.id] ?? []).map((reading) => (
                <IndicatorMeter key={reading.spec.key} reading={reading} />
              ))}
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-2 flex items-start gap-1.5">
        <Info className="mt-0.5 h-3 w-3 shrink-0 text-ink-muted" aria-hidden />
        <div className="flex-1">
          <CaveatList
            dense
            items={[
              <>
                Survey scores and composite estimates are ordinal reads, not
                measurements: a small gap between two countries is not a finding.
              </>,
              <>
                No inventory of non-tariff measures is published here - the WTO and
                UNCTAD datasets that hold one are not publicly reachable, so the
                customs-clearance score stands in as a labelled proxy for border friction
                and counts nobody&apos;s certificates or quotas.
              </>,
              <>
                Freight rates for a particular route are commercial data; shipping
                connectivity describes a country&apos;s place in the network, not the
                cost of shipping anything.
              </>,
            ]}
          />
        </div>
      </div>
    </section>
  );
}

function FamilyGlyph({ family }: { family: string }) {
  const Icon = familyIcon(family);
  return <Icon className="h-3 w-3" aria-hidden />;
}

/**
 * Pair the directional money series up.
 *
 * The pairing lives here rather than in the chart because a server component builds it,
 * and anything exported from a `"use client"` module cannot be called from the server -
 * the same reason `lib/pairing.ts` exists.
 */
function moneyRows(
  family: string,
  readings: IndicatorReading[],
  countryName: string,
): FlowPairRow[] {
  const find = (key: string) => readings.find((r) => r.spec.key === key) ?? null;

  const pairs: { label: string; out: string; in: string; outLabel: string; inLabel: string }[] =
    family === "services"
      ? [
          {
            label: "Commercial services",
            out: "services_exports",
            in: "services_imports",
            outLabel: `${countryName} sells abroad`,
            inLabel: `${countryName} buys from abroad`,
          },
        ]
      : [
          {
            label: "Remittances",
            out: "remittances_in",
            in: "remittances_out",
            outLabel: `Sent home to ${countryName}`,
            inLabel: `Sent abroad from ${countryName}`,
          },
          {
            label: "Direct investment",
            out: "fdi_in",
            in: "fdi_out",
            outLabel: `Invested into ${countryName}`,
            inLabel: `${countryName} invested abroad`,
          },
        ];

  return pairs
    .map((pair) => ({
      label: pair.label,
      outward: find(pair.out),
      inward: find(pair.in),
      outLabel: pair.outLabel,
      inLabel: pair.inLabel,
    }))
    .filter((row) => row.outward || row.inward);
}
