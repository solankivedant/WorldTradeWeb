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
  latestYear,
  partnersFor,
  productsFor,
  provenance,
  seriesFor,
  totalsFor,
  worldExports,
  dataset,
} from "@/lib/data";
import { Card, Crumb, Empty, ProvenanceBar, Stat, Warn } from "@/components/ui";
import { TradeSeries } from "@/components/charts/trade-series";
import { SectorCompare } from "@/components/charts/sector-compare";
import { PartnerCompare } from "@/components/charts/partner-compare";
import { pairPartners, pairSectors } from "@/lib/pairing";
import { flagEmoji, growth, pct, share, usd } from "@/lib/format";

export async function generateMetadata({ params }: { params: Promise<{ iso: string }> }) {
  const { iso } = await params;
  const country = getCountry(iso);
  return { title: country ? `${country.name} - trade profile | TradeCenter` : "Country" };
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
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Crumb items={[{ label: "Map", href: "/" }, { label: country.name }]} />
        <h1 className="mt-3 text-2xl font-semibold">
          {flagEmoji(country.iso2)} {country.name}
        </h1>
        <div className="card mt-6">
          <Empty
            message={`${country.name} does not report trade statistics to this source.`}
            hint="Absent data is not zero. Some economies report to UN Comtrade but not to WITS, and some do not report at all."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-5 lg:px-6">
      <Crumb items={[{ label: "Map", href: "/" }, { label: country.name }]} />

      {/* ---- header ---- */}
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight">
            <span aria-hidden>{flagEmoji(country.iso2)}</span>
            {country.name}
          </h1>
          <p className="mt-1 text-xs text-ink-muted">
            {[country.region, country.incomeGroup, country.capital]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="flex items-center gap-2">
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
        </div>
      </div>

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

      {/* ---- composition and partners, each comparing both directions ---- */}
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <SectorCompare
          rows={sectorPairs}
          title="Trade by sector"
          subtitle={`${year} · exports against imports · click a sector for its global market`}
        />
        <PartnerCompare
          rows={partners}
          originIso={country.iso3}
          title="Top trading partners"
          subtitle={`${year} · both directions · click for the corridor dashboard`}
        />
      </div>

      {/* ---- time series ---- */}
      <div className="mt-3">
        <TradeSeries
          data={series}
          title="Trade over time"
          subtitle={`${series[0]?.year ?? ""}-${series[series.length - 1]?.year ?? ""} · world totals`}
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

      <div className="card mt-3 overflow-hidden">
        <ProvenanceBar meta={meta} extra={`${country.name} · ${year}`} />
      </div>
    </div>
  );
}
