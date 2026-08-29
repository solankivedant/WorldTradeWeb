import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowUpRight,
  Boxes,
  Globe2,
  Percent,
  Scale,
  Trophy,
} from "lucide-react";
import {
  avgTariff,
  diversificationHHI,
  exportRank,
  gdpFor,
  getCountry,
  indicatorFamilies,
  indicatorsFor,
  latestYear,
  mirrorFor,
  mirrorPartners,
  partnersFor,
  productsFor,
  provenance,
  seriesFor,
  totalsFor,
  worldExports,
  dataset,
} from "@/lib/data";
import { Card, Crumb, Empty, ProvenanceBar, Stat, Warn } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { RelatedViews } from "@/components/related-views";
import {
  TO_SOURCE,
  toCorridor,
  toExplore,
  toNeeds,
  toOpportunities,
  toSector,
  toTariffs,
  type RelatedLink,
} from "@/lib/views";
import { TradeSeries } from "@/components/charts/trade-series";
import { SectorCompare } from "@/components/charts/sector-compare";
import { PartnerCompare } from "@/components/charts/partner-compare";
import { leadingSectors, pairPartners, pairSectors } from "@/lib/pairing";
import { TopSectors } from "@/components/top-sectors";
import { growth, pct, share, usd } from "@/lib/format";
import { CountryFlag } from "@/components/country-flag";
import { MirrorCountry, toMirrorPairs } from "@/components/mirror-country";
import { CountryContext } from "@/components/country-context";

export async function generateMetadata({ params }: { params: Promise<{ iso: string }> }) {
  const { iso } = await params;
  const country = getCountry(iso);
  return { title: country ? `${country.name} - trade profile | WorldTradeWeb` : "Country" };
}

export default async function CountryPage({ params }: { params: Promise<{ iso: string }> }) {
  const { iso } = await params;
  const country = getCountry(iso);
  if (!country) notFound();

  const year = latestYear();
  const totals = totalsFor(country.iso3, year);
  const previous = totalsFor(country.iso3, year - 1);
  const series = seriesFor(country.iso3);

  const exports = totals.x ?? null;
  const imports = totals.m ?? null;
  const balance = exports !== null && imports !== null ? exports - imports : null;

  const exportProducts = productsFor(country.iso3, "x");
  const importProducts = productsFor(country.iso3, "m");

  /**
   * One row per partner carrying BOTH directions.
   *
   * This used to be two lists - top export destinations and top import sources - which
   * put the same partner at two different ranks in two different cards and left the
   * reader to reassemble the relationship. Merging on partner and ranking by total trade
   * makes the relationship the unit, and the balance with each partner visible directly.
   */
  const toInputs = (flow: "x" | "m") =>
    partnersFor(country.iso3, flow, 40).map((row) => {
      const partner = getCountry(row.p);
      return {
        iso3: row.p,
        name: partner?.name ?? row.p,
        iso2: partner?.iso2 ?? null,
        value: row.v,
      };
    });

  const partners = pairPartners(toInputs("x"), toInputs("m"));
  const sectorPairs = pairSectors(exportProducts, importProducts);
  // Ranked within each direction, not by the two combined - the largest export can sit
  // well down a combined ranking. Both sides are rendered together or not at all.
  const leading = leadingSectors(exportProducts, importProducts);

  const rank = exportRank(country.iso3, year);
  const worldTotal = worldExports(year);
  const gdp = gdpFor(country.iso3, year);
  const hhi = diversificationHHI(country.iso3);
  const tariff = avgTariff(country.iso3);
  const meta = provenance();

  // Countries where WITS's own product-level and total-level aggregations disagree get
  // a visible warning rather than a silently reconciled number.
  const reconWarnings = (dataset().meta as unknown as { reconciliation_warnings?: string[] })
    .reconciliation_warnings ?? [];
  const hasReconIssue = reconWarnings.some((w) => w.startsWith(country.iso3));

  if (exports === null && imports === null && !exportProducts.length) {
    /**
     * Nothing reported. Before giving up, check whether the country's partners describe
     * it - 53 of the 61 silent economies are reconstructable that way, and Russia at
     * $424B is the largest of them. The map already draws those corridors, so a page
     * that says "does not report" here is the product contradicting itself, with the
     * less accurate half winning.
     *
     * A separate component, not a branch inside this one: mirror figures must never
     * share a render path with reported ones.
     */
    const estimate = mirrorFor(country.iso3);
    if (estimate) {
      const mirrored = mirrorPartners(country.iso3, 40);
      const named = (rows: { iso3: string; value: number }[]) =>
        rows.map((row) => {
          const partner = getCountry(row.iso3);
          return {
            iso3: row.iso3,
            name: partner?.name ?? row.iso3,
            iso2: partner?.iso2 ?? null,
            value: row.value,
            share: null,
          };
        });
      return (
        <MirrorCountry
          country={country}
          estimate={estimate}
          partners={toMirrorPairs(named(mirrored.exports), named(mirrored.imports))}
          meta={meta}
          worldTotal={worldTotal}
          families={indicatorFamilies()}
          readings={indicatorsFor(country.iso3)}
        />
      );
    }

    return (
      <div className="mx-auto max-w-3xl p-6">
        <Crumb items={[{ label: "Map", href: "/" }, { label: country.name }]} />
        <h1 className="mt-3 flex items-center gap-2.5 text-2xl font-semibold">
          <CountryFlag iso2={country.iso2} name={country.name} size="lg" />
          {country.name}
        </h1>
        <div className="card mt-6">
          <Empty
            message={`${country.name} does not report trade statistics, and no partner reports trading with it.`}
            hint="Absent data is not zero. Several entries here are territories counted inside a parent customs union - Monaco within France, Puerto Rico within the United States - so their trade appears under that parent rather than being missing."
          />
        </div>
      </div>
    );
  }

  /**
   * Where this country leads next.
   *
   * Built from the rows already ranked above rather than from a fixed list, so the
   * corridor offered is genuinely this country's largest and the sector is genuinely what
   * it sells most. A "related" link that points somewhere generic teaches the reader that
   * these links are decoration.
   */
  const topPartner = partners[0] ?? null;
  const topSector = leading.exports;
  const relatedLinks: RelatedLink[] = [
    topPartner
      ? toCorridor(country.iso3, topPartner.iso3, country.name, topPartner.name)
      : null,
    topSector ? toSector(topSector.code, topSector.name) : null,
    toNeeds(country.iso3, country.name),
    toTariffs(country.iso3, country.name),
    toOpportunities(country.iso3, country.name),
    toExplore(`?country=${country.iso3}&view=connections`, country.name),
    TO_SOURCE,
  ].filter((link): link is RelatedLink => link !== null);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-5 lg:px-6">
      <PageHeader
        crumb={[
          { label: "Map", href: "/" },
          { label: "Countries", href: "/explore?view=connections" },
          { label: country.name },
        ]}
        view="country"
        title={country.name}
        subject={<CountryFlag iso2={country.iso2} name={country.name} size="xl" />}
        meta={[country.region, country.incomeGroup, country.capital].filter(Boolean).join(" · ")}
        lede={`Figures below are ${country.name}'s own customs reports for ${year}, with the previous year alongside for change.`}
        actions={
          <>
            <Link
              href={`/opportunities?origin=${country.iso3}`}
              className="flex items-center gap-1.5 rounded-md border border-series-1/40 bg-series-1/10 px-3 py-1.5 text-xs text-ink hover:bg-series-1/20"
            >
              Export opportunities from {country.iso3}
              <ArrowUpRight className="h-3 w-3" aria-hidden />
            </Link>
            <span className="tabular rounded-md border border-hairline px-2.5 py-1.5 text-xs text-ink-secondary">
              {year}
            </span>
          </>
        }
      />

      {/* ---- KPI row ---- */}
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          icon={<ArrowUpFromLine className="h-3 w-3" aria-hidden />}
          label="Exports"
          value={usd(exports)}
          delta={growth(exports, previous.x)}
          deltaLabel={`vs ${year - 1}`}
        />
        <Stat
          icon={<ArrowDownToLine className="h-3 w-3" aria-hidden />}
          label="Imports"
          value={usd(imports)}
          delta={growth(imports, previous.m)}
          deltaLabel={`vs ${year - 1}`}
        />
        <Stat
          icon={<Scale className="h-3 w-3" aria-hidden />}
          label="Trade balance"
          value={usd(balance)}
          hint={balance === null ? "" : balance >= 0 ? "surplus" : "deficit"}
          toneValue={balance}
        />
        <Stat
          icon={<Trophy className="h-3 w-3" aria-hidden />}
          label="World export rank"
          value={rank ? `#${rank}` : "-"}
          hint={
            exports !== null && worldTotal > 0
              ? `${pct(share(exports, worldTotal), 2)} of world exports`
              : "not reported"
          }
        />
      </div>

      {hasReconIssue && (
        <div className="mt-3">
          <Warn>
            For {country.name}, the source&apos;s sector-level and country-level figures do
            not reconcile. Both are shown as published rather than adjusted - treat the
            sector split as approximate.
          </Warn>
        </div>
      )}

      {/* ---- what it trades most, stated before the mix that implies it ---- */}
      <div className="mt-3">
        <TopSectors
          exports={leading.exports}
          imports={leading.imports}
          reporterName={country.name}
        />
      </div>

      {/* ---- composition and partners, each comparing both directions ---- */}
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <SectorCompare
          rows={sectorPairs}
          reporterName={country.name}
          title="Trade by sector"
          subtitle={`${year} · what ${country.name} sells abroad against what it buys in · click a sector for its global market`}
        />
        <PartnerCompare
          rows={partners}
          originIso={country.iso3}
          originName={country.name}
          title="Top trading partners"
          subtitle={`${year} · ${country.name} → partner against partner → ${country.name} · click for the corridor dashboard`}
        />
      </div>

      {/* ---- time series ---- */}
      <div className="mt-3">
        <TradeSeries
          data={series}
          reporterName={country.name}
          title="Trade over time"
          subtitle={`${series[0]?.year ?? ""}-${series[series.length - 1]?.year ?? ""} · ${country.name} trade with the whole world`}
        />
      </div>

      {/* ---- context ---- */}
      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <Card title="Tariff profile" icon={<Percent className="h-3 w-3" aria-hidden />}>
          <div className="px-4 pb-4 pt-1">
            {tariff === null ? (
              <p className="text-sm text-ink-muted">No tariff schedule published.</p>
            ) : (
              <>
                <div className="text-2xl font-semibold">{pct(tariff)}</div>
                <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                  Average effectively applied tariff {country.name} charges across all
                  partners. A simple average - it hides wide dispersion between products.
                </p>
                <Link
                  href={`/tariffs?reporter=${country.iso3}`}
                  className="mt-3 inline-flex items-center gap-1 text-xs text-series-1 hover:underline"
                >
                  Compare rates by partner
                  <ArrowUpRight className="h-3 w-3" aria-hidden />
                </Link>
              </>
            )}
          </div>
        </Card>

        <Card title="Export concentration" icon={<Boxes className="h-3 w-3" aria-hidden />}>
          <div className="px-4 pb-4 pt-1">
            {hhi === null ? (
              <p className="text-sm text-ink-muted">No sector breakdown published.</p>
            ) : (
              <>
                <div className="text-2xl font-semibold tabular">{Math.round(hhi)}</div>
                <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                  Herfindahl index across export sectors (0-10,000).{" "}
                  {hhi > 2500
                    ? "Highly concentrated - a small number of sectors carry most exports."
                    : hhi > 1500
                      ? "Moderately concentrated."
                      : "Diversified across many sectors."}
                </p>
              </>
            )}
          </div>
        </Card>

        <Card title="Trade openness" icon={<Globe2 className="h-3 w-3" aria-hidden />}>
          <div className="px-4 pb-4 pt-1">
            {gdp === null || exports === null || imports === null ? (
              <p className="text-sm text-ink-muted">GDP not reported for {year}.</p>
            ) : (
              <>
                <div className="text-2xl font-semibold">
                  {pct(((exports + imports) / gdp) * 100, 0)}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                  Goods trade as a share of GDP ({usd(gdp)}). Values above 100% are normal
                  for re-export hubs, where the same goods are counted on the way in and
                  the way out.
                </p>
              </>
            )}
          </div>
        </Card>
      </div>

      <CountryContext
        families={indicatorFamilies()}
        readings={indicatorsFor(country.iso3)}
        countryName={country.name}
      />

      {/*
        The page used to end at the provenance strip, which made a country a dead end: the
        biggest partner and the biggest sector were both on screen as bars, and neither
        said that a whole screen existed behind it. These links are built from the figures
        already computed above, so they always point at this country's actual largest
        relationships rather than at a generic list.
      */}
      <RelatedViews
        links={relatedLinks}
        hint={`The same build, ${country.name} seen from other angles`}
      />

      <div className="card mt-3 overflow-hidden">
        <ProvenanceBar meta={meta} extra={`${country.name} · ${year}`} />
      </div>
    </div>
  );
}
