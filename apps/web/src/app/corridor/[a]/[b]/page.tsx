import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
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
import { PageHeader } from "@/components/page-header";
import { RelatedViews } from "@/components/related-views";
import {
  TO_SOURCE,
  toCountry,
  toExplore,
  toOpportunities,
  toSector,
  toTariffs,
  type RelatedLink,
} from "@/lib/views";
import { SectorCompare } from "@/components/charts/sector-compare";
import { leadingSectors, pairSectors } from "@/lib/pairing";
import { TopSectors } from "@/components/top-sectors";
import { MirrorCompare } from "@/components/charts/mirror-compare";
import { GapTable } from "@/components/charts/gap-table";
import { CountryFlag } from "@/components/country-flag";
import { TariffRateCell } from "@/components/tariff-rate-cell";
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

  /**
   * Widening out from this corridor. The sector offered is what the corridor itself
   * carries most, read from the corridor cube - not either country's world mix, which is
   * a different question and routinely a different answer.
   */
  const corridorSector = corridorLeading.exports ?? corridorLeading.imports;
  const relatedLinks: RelatedLink[] = [
    toCountry(ca.iso3, ca.name),
    toCountry(cb.iso3, cb.name),
    corridorSector ? toSector(corridorSector.code, corridorSector.name) : null,
    toTariffs(cb.iso3, cb.name, ca.iso3),
    toOpportunities(ca.iso3, ca.name),
    toExplore(`?a=${ca.iso3}&b=${cb.iso3}&view=compare`),
    TO_SOURCE,
  ].filter((link): link is RelatedLink => link !== null);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-5 lg:px-6">
      <PageHeader
        crumb={[
          { label: "Map", href: "/" },
          { label: ca.name, href: `/country/${ca.iso3}` },
          { label: `${ca.iso3} and ${cb.iso3}` },
        ]}
        view="corridor"
        title={
          <>
            {/* Both ends stay clickable inside the heading. A corridor is the one page
                whose title names two subjects, and a reader who arrived from one of them
                usually wants the other. */}
            <Link href={`/country/${ca.iso3}`} className="flex items-center gap-2 hover:underline">
              <CountryFlag iso2={ca.iso2} name={ca.name} size="lg" />
              {ca.name}
            </Link>
            <ArrowLeftRight className="h-4 w-4 text-ink-muted" aria-hidden />
            <Link href={`/country/${cb.iso3}`} className="flex items-center gap-2 hover:underline">
              <CountryFlag iso2={cb.iso2} name={cb.name} size="lg" />
              {cb.name}
            </Link>
          </>
        }
        meta={`${year} · both directions, each reported by the country that sells`}
        lede={`Everything here is scoped to these two countries only - ${ca.name}'s world totals live on its own page.`}
        actions={
          <Link
            href={`/corridor/${cb.iso3}/${ca.iso3}`}
            className="flex items-center gap-1.5 rounded-lg border border-hairline px-3 py-1.5 text-xs text-ink-secondary transition-colors hover:bg-raised hover:text-ink"
          >
            <Repeat className="h-3.5 w-3.5" aria-hidden />
            Read it from {cb.iso3}
          </Link>
        }
      />

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
          toneValue={balance}
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
            <TariffRateCell label={`${cb.iso3} charges ${ca.iso3}`} rate={tariffBonA} />
            <TariffRateCell label={`${ca.iso3} charges ${cb.iso3}`} rate={tariffAonB} />
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

      {/*
        The two bare buttons that used to close this page named routes rather than
        questions, and left out the three places a corridor most obviously leads: either
        country's own profile, and the worldwide market for whatever this corridor
        actually carries.
      */}
      <RelatedViews
        links={relatedLinks}
        hint={`Same build, ${ca.iso3}-${cb.iso3} widened out`}
      />

      <div className="card mt-3 overflow-hidden">
        <ProvenanceBar meta={meta} extra={`${ca.iso3}-${cb.iso3} · ${year}`} />
      </div>
    </div>
  );
}
