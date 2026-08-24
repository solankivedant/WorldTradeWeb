import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  ArrowUpRight,
  Percent,
  Repeat,
  Scale,
  ShoppingCart,
} from "lucide-react";
import {
  bilateralValue,
  corridorSectors,
  getCountry,
  latestYear,
  productsFor,
  provenance,
  tariffApplied,
  tariffYear,
  totalsFor,
} from "@/lib/data";
import { Card, Crumb, Empty, EstimateTag, ProvenanceBar, Stat, Warn } from "@/components/ui";
import { SectorCompare } from "@/components/charts/sector-compare";
import { leadingSectors, pairSectors } from "@/lib/pairing";
import { TopSectors } from "@/components/top-sectors";
import { MirrorCompare } from "@/components/charts/mirror-compare";
import { GapTable } from "@/components/charts/gap-table";
import { CountryFlag } from "@/components/country-flag";
import { pct, share, usd } from "@/lib/format";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ a: string; b: string }>;
}) {
  const { a, b } = await params;
  const ca = getCountry(a);
  const cb = getCountry(b);
  return {
    title: ca && cb ? `${ca.name} ↔ ${cb.name} - trade corridor | WorldTradeWeb` : "Corridor",
  };
}

export default async function CorridorPage({
  params,
}: {
  params: Promise<{ a: string; b: string }>;
}) {
  const { a, b } = await params;
  const ca = getCountry(a);
  const cb = getCountry(b);
  if (!ca || !cb || ca.iso3 === cb.iso3) notFound();

  const year = latestYear();
  const rateYear = tariffYear();

  // Both sides of both directions. A's reported exports to B and B's reported imports
  // from A describe the same physical trade and routinely disagree - that gap is data,
  // not an error to reconcile away.
  const aExportsToB = bilateralValue(ca.iso3, cb.iso3, "x");
  const bImportsFromA = bilateralValue(cb.iso3, ca.iso3, "m");
  const bExportsToA = bilateralValue(cb.iso3, ca.iso3, "x");
  const aImportsFromB = bilateralValue(ca.iso3, cb.iso3, "m");

  if (aExportsToB === null && bExportsToA === null && bImportsFromA === null && aImportsFromB === null) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Crumb
          items={[
            { label: "Map", href: "/" },
            { label: ca.name, href: `/country/${ca.iso3}` },
            { label: cb.name },
          ]}
        />
        <h1 className="mt-3 text-2xl font-semibold">
          {ca.name} ↔ {cb.name}
        </h1>
        <div className="card mt-6">
          <Empty
            message="Neither country reports bilateral trade with the other."
            hint="This may mean no trade, or simply that neither side reports at this level of detail. The two are not the same and we do not guess which applies."
          />
        </div>
      </div>
    );
  }

  const gap =
    aExportsToB !== null && bImportsFromA !== null && aExportsToB > 0
      ? ((bImportsFromA - aExportsToB) / aExportsToB) * 100
      : null;

  const aTotals = totalsFor(ca.iso3, year);
  const bTotals = totalsFor(cb.iso3, year);
  const balance =
    aExportsToB !== null && bExportsToA !== null ? aExportsToB - bExportsToA : null;

  const tariffBonA = tariffApplied(cb.iso3, ca.iso3);
  const tariffAonB = tariffApplied(ca.iso3, cb.iso3);

  const aProducts = productsFor(ca.iso3, "x");
  const bProducts = productsFor(cb.iso3, "x");
  const bImportProducts = productsFor(cb.iso3, "m");

  // Each country's own sector mix, both directions against one centre line. Showing only
  // the export side here would hide the fact that a country can be a large exporter AND a
  // large importer of the same sector, which is the normal case for manufactured goods.
  const aSectors = pairSectors(aProducts, productsFor(ca.iso3, "m"));
  const bSectors = pairSectors(bProducts, bImportProducts);

  /**
   * What actually moves along THIS corridor, per direction.
   *
   * Read from the corridor-by-sector cube, not from either country's world mix. Those are
   * different questions and they routinely give different answers: India's largest export
   * to the world is refined fuel, but its largest export to China is chemicals. The page
   * showed both countries' world mixes and never once said what the corridor itself
   * carries, which is the thing a reader opened a corridor page to find out.
   */
  const corridorLeading = leadingSectors(
    corridorSectors(ca.iso3, cb.iso3, "x"),
    corridorSectors(cb.iso3, ca.iso3, "x"),
  );

  // Gap analysis: sectors B imports heavily from the world, where A is a capable
  // exporter. This is the corridor-level version of the opportunity engine's core rule.
  const aByCode = new Map(aProducts.map((p) => [p.code, p.value]));
  const aTotalExports = aProducts.reduce((s, p) => s + p.value, 0);
  const gaps = bImportProducts
    .map((row) => {
      const originExports = aByCode.get(row.code) ?? 0;
      return {
        code: row.code,
        name: row.name,
        destinationImports: row.value,
        originExports,
        originWorldShare: aTotalExports > 0 ? (originExports / aTotalExports) * 100 : null,
      };
    })
    .filter((row) => row.destinationImports > 5e8 && row.originExports > 1e8)
    .sort((x, y) => y.destinationImports - x.destinationImports)
    .slice(0, 8);

  const meta = provenance();

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-5 lg:px-6">
      <Crumb
        items={[
          { label: "Map", href: "/" },
          { label: ca.name, href: `/country/${ca.iso3}` },
          { label: cb.name },
        ]}
      />

      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
            <Link
              href={`/country/${ca.iso3}`}
              className="flex items-center gap-2 hover:underline"
            >
              <CountryFlag iso2={ca.iso2} name={ca.name} size="lg" />
              {ca.name}
            </Link>
            <ArrowLeftRight className="h-4 w-4 text-ink-muted" aria-hidden />
            <Link
              href={`/country/${cb.iso3}`}
              className="flex items-center gap-2 hover:underline"
            >
              <CountryFlag iso2={cb.iso2} name={cb.name} size="lg" />
              {cb.name}
            </Link>
          </h1>
          <p className="mt-1 text-xs text-ink-muted">
            Bilateral trade corridor · {year} · both directions, each reported by the country
            that sells
          </p>
        </div>
        <Link
          href={`/corridor/${cb.iso3}/${ca.iso3}`}
          className="flex items-center gap-1.5 rounded-lg border border-hairline px-3 py-1.5 text-xs text-ink-secondary transition-colors hover:bg-raised hover:text-ink"
        >
          <Repeat className="h-3.5 w-3.5" aria-hidden />
          Reverse direction
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          icon={<ArrowUpFromLine className="h-3 w-3" aria-hidden />}
          label={`${ca.name} sells to ${cb.name}`}
          value={usd(aExportsToB)}
          hint={`${ca.iso3} → ${cb.iso3} · ${pct(share(aExportsToB, aTotals.x), 1)} of all ${ca.name} exports`}
        />
        <Stat
          icon={<ArrowDownToLine className="h-3 w-3" aria-hidden />}
          label={`${cb.name} sells to ${ca.name}`}
          value={usd(bExportsToA)}
          hint={`${cb.iso3} → ${ca.iso3} · ${pct(share(bExportsToA, bTotals.x), 1)} of all ${cb.name} exports`}
        />
        <Stat
          icon={<Scale className="h-3 w-3" aria-hidden />}
          label={`Balance for ${ca.iso3}`}
          value={usd(balance)}
          hint={balance === null ? "" : balance >= 0 ? "surplus" : "deficit"}
        />
        <Stat
          icon={<Percent className="h-3 w-3" aria-hidden />}
          label={`Tariff ${cb.iso3} charges ${ca.iso3}`}
          value={tariffBonA === null ? "-" : pct(tariffBonA)}
          hint={tariffBonA === null ? "not published" : "effectively applied, avg"}
        />
      </div>

      {/* ---- what this corridor actually carries, each way ---- */}
      <div className="mt-3">
        <TopSectors
          exports={corridorLeading.exports}
          imports={corridorLeading.imports}
          reporterName={ca.name}
          title={`What moves between ${ca.name} and ${cb.name}`}
          // "sells most" alone would be read as selling to the world. On a corridor both
          // ends have to be named on every side.
          exportHeading={`${ca.name} sells ${cb.name} most`}
          importHeading={`${cb.name} sells ${ca.name} most`}
          shareOf={{
            exports: `this direction of the corridor`,
            imports: `this direction of the corridor`,
          }}
        />
      </div>

      {/* Mirror discrepancy - surfaced, never smoothed. */}
      <div className="mt-3">
        <MirrorCompare
          originName={ca.name}
          destinationName={cb.name}
          originReported={aExportsToB}
          destinationReported={bImportsFromA}
          gapPct={gap}
        />
      </div>

      <div className="mt-3 grid items-start gap-3 lg:grid-cols-2">
        <Card title="Tariffs in this corridor" icon={<Percent className="h-3 w-3" aria-hidden />}>
          <div className="grid grid-cols-2 gap-px bg-hairline">
            <TariffCell
              from={cb.name}
              to={ca.name}
              fromIso={cb.iso3}
              toIso={ca.iso3}
              rate={tariffBonA}
            />
            <TariffCell
              from={ca.name}
              to={cb.name}
              fromIso={ca.iso3}
              toIso={cb.iso3}
              rate={tariffAonB}
            />
          </div>
          <p className="px-4 py-3 text-2xs leading-relaxed text-ink-muted">
            {rateYear === null
              ? "Rates carry no recorded year in this build."
              : `Rates are for ${rateYear}, the newest year the source publishes - not current-day rates.`}{" "}
            Simple averages of effectively applied rates across all products. A product
            you actually ship may face a very different rate, and a preferential rate
            under a trade agreement usually requires meeting rules of origin.
          </p>
        </Card>

        <Card
          title={`${cb.name} trade mix`}
          icon={<ShoppingCart className="h-3 w-3" aria-hidden />}
        >
          <div className="p-3">
            <SectorCompare rows={bSectors} reporterName={cb.name} title="" limit={6} />
          </div>
        </Card>
      </div>

      <div className="mt-3">
        <GapTable
          rows={gaps}
          originName={ca.name}
          originIso={ca.iso3}
          destinationName={cb.name}
        />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <SectorCompare
          rows={aSectors}
          reporterName={ca.name}
          title={`${ca.name} trade by sector`}
          subtitle={`What ${ca.name} sells to the world against what it buys from the world`}
          limit={6}
        />
        <SectorCompare
          rows={bSectors}
          reporterName={cb.name}
          title={`${cb.name} trade by sector`}
          subtitle={`What ${cb.name} sells to the world against what it buys from the world`}
          limit={6}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href={`/opportunities?origin=${ca.iso3}`}
          className="flex items-center gap-1.5 rounded-md border border-series-1/40 bg-series-1/10 px-3 py-1.5 text-xs hover:bg-series-1/20"
        >
          Opportunities from {ca.name}
          <ArrowUpRight className="h-3 w-3" aria-hidden />
        </Link>
        <Link
          href={`/tariffs?reporter=${cb.iso3}&partner=${ca.iso3}`}
          className="flex items-center gap-1.5 rounded-md border border-hairline px-3 py-1.5 text-xs text-ink-secondary hover:text-ink"
        >
          Tariff detail
          <ArrowUpRight className="h-3 w-3" aria-hidden />
        </Link>
      </div>

      <div className="card mt-3 overflow-hidden">
        <ProvenanceBar meta={meta} extra={`${ca.iso3}-${cb.iso3} · ${year}`} />
      </div>
    </div>
  );
}

function TariffCell({
  from,
  to,
  fromIso,
  toIso,
  rate,
}: {
  from: string;
  to: string;
  fromIso: string;
  toIso: string;
  rate: number | null;
}) {
  return (
    <div className="bg-surface px-4 py-3">
      <div className="text-2xs uppercase tracking-wider text-ink-muted">
        {fromIso} charges {toIso}
      </div>
      <div className="mt-1 text-2xl font-semibold">{rate === null ? "-" : pct(rate)}</div>
      <p className="mt-0.5 text-2xs text-ink-muted">
        {rate === null ? "Not published for this pair" : `${from} on goods from ${to}`}
      </p>
    </div>
  );
}
