import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowUpRight,
  Info,
  Scale,
  Users,
} from "lucide-react";
import { Card, Crumb, EstimateTag, ProvenanceBar, Stat } from "@/components/ui";
import { CountryFlag } from "@/components/country-flag";
import { SectorCompare } from "@/components/charts/sector-compare";
import { PartnerCompare } from "@/components/charts/partner-compare";
import { pct, share, usd } from "@/lib/format";
import type { MirrorEstimate } from "@/lib/data";
import type { Country, PartnerRow, Provenance } from "@/lib/types";
import type { PartnerPair } from "@/lib/pairing";

/**
 * A country page for an economy that reports nothing.
 *
 * 61 economies file no trade report - Russia, Iraq, Bangladesh, Algeria, Iran among them -
 * and UN Comtrade has nothing for them either. Until now their pages were a dead end
 * reading "does not report", while the map beside it reconstructed Russia selling $424B
 * from partner records. The product contradicted itself, and the more accurate half was
 * the one the page did not show.
 *
 * So this page shows the mirror reconstruction instead of an empty state, under three
 * rules that keep it honest:
 *
 *   1. It is never mixed with reported data. This is a SEPARATE page component reading a
 *      separate published file, so a mirror figure cannot leak into a screen that a
 *      reader takes to be customs declarations.
 *   2. Every figure carries `est`, and the banner explains the method before the numbers.
 *   3. The partner COUNT is shown next to each total, because it is the honest weight of
 *      the estimate - $424B assembled from 148 partners is a good number, the same figure
 *      from three partners would be a rumour, and only the count tells them apart.
 */
export function MirrorCountry({
  country,
  estimate,
  partners,
  meta,
  worldTotal,
}: {
  country: Country;
  estimate: MirrorEstimate;
  partners: PartnerPair[];
  meta: Provenance;
  worldTotal: number;
}) {
  const balance =
    estimate.exports !== null && estimate.imports !== null
      ? estimate.exports - estimate.imports
      : null;

  const sectorPairs = estimate.sectors.map((s) => ({
    code: s.code,
    name: s.name,
    exports: s.exports,
    imports: s.imports,
    net: s.exports !== null && s.imports !== null ? s.exports - s.imports : null,
  }));

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-5 lg:px-6">
      <Crumb items={[{ label: "Map", href: "/" }, { label: country.name }]} />

      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight">
            <CountryFlag iso2={country.iso2} name={country.name} size="xl" />
            {country.name}
          </h1>
          <p className="mt-1 text-xs text-ink-muted">
            {[country.region, country.incomeGroup, country.capital].filter(Boolean).join(" · ")}
          </p>
        </div>
        <span className="tabular rounded-md border border-hairline px-2.5 py-1.5 text-xs text-ink-secondary">
          {estimate.year}
        </span>
      </div>

      {/* The method comes BEFORE the numbers, not in a footnote under them. A reader who
          scrolls past this has still seen it. */}
      <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-status-warning/30 bg-status-warning/5 px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-status-warning" aria-hidden />
        <div className="text-xs leading-relaxed text-ink-secondary">
          <p>
            <span className="font-medium text-ink">
              {country.name} publishes no trade statistics.
            </span>{" "}
            Every figure on this page is rebuilt from what its trading partners report -
            each of their imports from {country.name} is one of its exports, and each of
            their exports to it is one of its imports.
          </p>
          <p className="mt-1.5">
            These are estimates, not declarations. Partners value, time and classify the
            same shipment differently, and trade with partners who also report nothing is
            invisible here - so treat the totals as a floor rather than a measurement.{" "}
            <Link href="/source" className="text-series-1 hover:underline">
              How this is derived
            </Link>
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          icon={<ArrowUpFromLine className="h-3 w-3" aria-hidden />}
          label="Exports (estimated)"
          value={usd(estimate.exports)}
          hint={`from ${estimate.exportPartners} partners' import records`}
        />
        <Stat
          icon={<ArrowDownToLine className="h-3 w-3" aria-hidden />}
          label="Imports (estimated)"
          value={usd(estimate.imports)}
          hint={`from ${estimate.importPartners} partners' export records`}
        />
        <Stat
          icon={<Scale className="h-3 w-3" aria-hidden />}
          label="Trade balance (estimated)"
          value={usd(balance)}
          hint={balance === null ? "" : balance >= 0 ? "surplus" : "deficit"}
        />
        <Stat
          icon={<Users className="h-3 w-3" aria-hidden />}
          label="Share of world exports"
          value={
            estimate.exports !== null && worldTotal > 0
              ? pct(share(estimate.exports, worldTotal), 2)
              : "-"
          }
          hint="against reported world exports"
        />
      </div>

      <p className="mt-1.5 flex items-center text-2xs text-ink-muted">
        Every figure above is derived
        <EstimateTag />
      </p>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <SectorCompare
          rows={sectorPairs}
          reporterName={country.name}
          title="Trade by sector (estimated)"
          subtitle={`${estimate.year} · rebuilt from partner records · click a sector for its global market`}
        />
        <PartnerCompare
          rows={partners}
          originIso={country.iso3}
          originName={country.name}
          title="Top trading partners (estimated)"
          subtitle={`${estimate.year} · each partner's own record of trade with ${country.name}`}
          footnote={`Both sides are the PARTNER's figures, not ${country.name}'s: its exports here are what partners record buying from it, and its imports are what they record selling to it. Ranked by total trade with the partner. A partner that reports nothing itself contributes nothing to this list.`}
        />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Card title="Why there is no reported figure" icon={<Info className="h-3 w-3" aria-hidden />}>
          <div className="space-y-2 px-4 pb-4 pt-1 text-xs leading-relaxed text-ink-muted">
            <p>
              A country appears here when it files nothing with the World Bank&apos;s WITS
              and nothing with UN Comtrade for this year. The reasons differ - sanctions,
              conflict, a statistical agency without the capacity, or a deliberate policy
              change - and this page does not guess which applies to {country.name}.
            </p>
            <p>
              What it is not is zero trade. Absent data and reported zero are different
              facts and are kept apart everywhere in this product.
            </p>
          </div>
        </Card>
        <Card
          title="What these estimates miss"
          icon={<ArrowUpRight className="h-3 w-3" aria-hidden />}
        >
          <div className="space-y-2 px-4 pb-4 pt-1 text-xs leading-relaxed text-ink-muted">
            <p>
              Trade between {country.name} and other non-reporting economies leaves no
              record on either side and is simply absent from these totals. That biases
              the figures DOWN, which is why they are best read as a floor.
            </p>
            <p>
              Partner records also use the buyer&apos;s valuation, which normally includes
              freight and insurance where the seller&apos;s would not, so an estimated
              export total tends to sit above what the country would have reported itself.
            </p>
          </div>
        </Card>
      </div>

      <div className="mt-4">
        <ProvenanceBar
          meta={meta}
          extra={`${estimate.year} · mirror estimate from ${estimate.exportPartners} reporting partners`}
        />
      </div>
    </div>
  );
}

/** Shape the mirror partner lists into the paired rows `PartnerCompare` expects. */
export function toMirrorPairs(
  exportRows: PartnerRow[],
  importRows: PartnerRow[],
): PartnerPair[] {
  const byIso = new Map<string, PartnerPair>();
  for (const row of exportRows) {
    byIso.set(row.iso3, {
      iso3: row.iso3,
      name: row.name,
      iso2: row.iso2,
      exports: row.value,
      imports: null,
      net: null,
    });
  }
  for (const row of importRows) {
    const existing = byIso.get(row.iso3);
    if (existing) existing.imports = row.value;
    else
      byIso.set(row.iso3, {
        iso3: row.iso3,
        name: row.name,
        iso2: row.iso2,
        exports: null,
        imports: row.value,
        net: null,
      });
  }
  return [...byIso.values()]
    .map((row) => ({
      ...row,
      // Null unless both sides exist - half a comparison is not a comparison.
      net: row.exports !== null && row.imports !== null ? row.exports - row.imports : null,
    }))
    .sort((a, b) => (b.exports ?? 0) + (b.imports ?? 0) - ((a.exports ?? 0) + (a.imports ?? 0)));
}
