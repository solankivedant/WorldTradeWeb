import Link from "next/link";
import {
  ArrowDownToLine,
  Boxes,
  Gauge,
  Info,
  Percent,
  Scale as ScaleIcon,
  TriangleAlert,
} from "lucide-react";
import {
  allCountries,
  aviationFor,
  aviationMeta,
  avgTariff,
  frontierFor,
  frontierMeta,
  frontierYears,
  getCountry,
  latestYear,
  mirrorFor,
  provenance,
  seriesFor,
  totalsFor,
} from "@/lib/data";
import {
  groupContents,
  rankBalances,
  sectorBalances,
  supplyPicture,
  type NeedsSort,
  type SupplyPicture,
} from "@/lib/needs";
import { CaveatList, Empty, Fact, ProvenanceBar, Stat, Warn } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { RelatedViews } from "@/components/related-views";
import { NeedsControls } from "@/components/needs-controls";
import { NeedsExplorer } from "@/components/needs-explorer";
import { TradeSeries } from "@/components/charts/trade-series";
import { FrontierNote } from "@/components/frontier-note";
import { CountryFlag } from "@/components/country-flag";
import { growth, pct, usd } from "@/lib/format";
import {
  TO_SOURCE,
  toCountry,
  toExplore,
  toOpportunities,
  toSector,
  toTariffs,
  type RelatedLink,
} from "@/lib/views";

export const metadata = {
  title: "Supply and demand by country - WorldTradeWeb",
  description:
    "Which sector groups a country buys far more of than it sells, how much of its own demand it covers, who currently supplies the gap, and what it charges them at the border.",
};

/**
 * The country supply-and-demand view.
 *
 * A search param rather than a path segment (`/needs?country=USA`, not `/needs/USA`) to
 * match `/tariffs?reporter=` and `/opportunities?origin=`, the two other per-country
 * pages that are also nav destinations. They need a default subject to be linkable from a
 * bare menu item, and a path segment cannot have one.
 *
 * The default is the United States because it is the world's largest import market, which
 * makes it the most legible first example of a demand page.
 */
const DEFAULT_COUNTRY = "USA";

/** Suppliers listed per group. Beyond this the panel stops being scannable. */
const SUPPLIER_LIMIT = 8;

export default async function NeedsPage({
  searchParams,
}: {
  searchParams: Promise<{ country?: string; lens?: string; sort?: string; sector?: string }>;
}) {
  const sp = await searchParams;
  const iso = (sp.country || DEFAULT_COUNTRY).toUpperCase();
  const lens: "needs" | "supplies" = sp.lens === "supplies" ? "supplies" : "needs";
  const sort: NeedsSort =
    sp.sort === "coverage" ? "coverage" : sp.sort === "share" ? "share" : "gap";

  const country = getCountry(iso);
  const year = latestYear();
  const meta = provenance();

  const countries = allCountries()
    .map((c) => ({ iso3: c.iso3, iso2: c.iso2, name: c.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const controls = (
    <div className="mt-4">
      <NeedsControls countries={countries} country={country ? iso : ""} lens={lens} sort={sort} />
    </div>
  );

  const header = (
    <PageHeader
      crumb={[
        { label: "Map", href: "/" },
        { label: "Supply & demand", href: "/needs" },
        { label: country?.name ?? iso },
      ]}
      view="needs"
      title="Supply and demand"
      subject={
        country ? (
          <CountryFlag iso2={country.iso2} name={country.name} size="lg" />
        ) : (
          <ScaleIcon className="h-5 w-5 text-ink-muted" aria-hidden />
        )
      }
      meta={
        <>
          {country?.name ?? iso} · {year} · sixteen HS section groups, both directions
        </>
      }
      lede={`Every group ${country?.name ?? iso} trades, ranked by how far its buying outruns its selling. This is net reliance measured at customs - it does not know what the country produces for itself.`}
    />
  );

  if (!country) {
    return (
      <div className="mx-auto max-w-[1500px] px-4 py-5 lg:px-6">
        {header}
        {controls}
        <div className="card mt-4">
          <Empty message={`No country matches "${iso}".`} hint="Pick one above." />
        </div>
      </div>
    );
  }

  const balances = sectorBalances(iso);

  /**
   * No sector breakdown at all. For the sixty-odd economies that publish nothing this is
   * the normal case, and the right answer is to say which kind of nothing it is rather
   * than render sixteen empty rows: a mirror estimate exists for most of them, but it is
   * built by inverting partner reports and carries no sector split, so this page's
   * question genuinely cannot be answered for them.
   */
  if (!balances.length) {
    const estimated = mirrorFor(iso);
    return (
      <div className="mx-auto max-w-[1500px] px-4 py-5 lg:px-6">
        {header}
        {controls}
        <div className="card mt-4">
          <Empty
            message={`${country.name} does not publish a sector breakdown of its trade.`}
            hint={
              estimated
                ? `Its totals on this site are reconstructed from what its partners report, and that method recovers corridor values but not a sector split - so which groups it leans on cannot be derived. Its estimated profile is on its country page.`
                : "Absent data is not zero. Several entries here are territories counted inside a parent customs union, so their trade appears under that parent rather than being missing."
            }
          />
        </div>
        <RelatedViews
          links={[toCountry(iso, country.name), toExplore(`?country=${iso}&view=connections`, country.name), TO_SOURCE]}
          hint="Where this country can still be read"
        />
        <div className="card mt-3 overflow-hidden">
          <ProvenanceBar meta={meta} extra={`${country.name} · ${year}`} />
        </div>
      </div>
    );
  }

  const ranked = rankBalances(balances, lens, sort);

  // Every ranked group's suppliers, sent whole so selecting one never round-trips the
  // server. Sixteen groups by eight suppliers is a trivial payload.
  const pictures: Record<string, SupplyPicture> = {};
  const contents: Record<string, { hs: string; covers: string[] }> = {};
  for (const row of ranked) {
    pictures[row.code] = supplyPicture(iso, row.code, SUPPLIER_LIMIT);
    const inside = groupContents(row.code);
    if (inside) contents[row.code] = inside;
  }

  // ---- headline figures ----
  const totals = totalsFor(iso, year);
  const previous = totalsFor(iso, year - 1);
  const netBuyer = balances.filter((row) => row.gap !== null && row.gap > 0).length;
  const netSeller = balances.filter((row) => row.gap !== null && row.gap < 0).length;

  /*
   * The last two headline figures follow the LENS.
   *
   * They used to be buy-side always, so switching to "sells more" left a KPI row saying
   * "largest gap: fuels" above a list headed by transport - two different subjects on one
   * screen, with the louder one wrong. The first two stay fixed because they are
   * properties of the country rather than of the side being read.
   */
  const buying = lens === "needs";
  const onLens = balances.filter((row) =>
    row.gap !== null && (buying ? row.gap > 0 : row.gap < 0),
  );

  const extreme = [...onLens].sort(
    (a, b) => Math.abs(b.gap ?? 0) - Math.abs(a.gap ?? 0),
  )[0] ?? null;

  // Thinnest coverage on the needs side, strongest on the supplies side: in both cases
  // the most extreme example of the lens the reader has chosen.
  const edge = onLens
    .filter((row) => row.coverage !== null)
    .sort((a, b) =>
      buying ? (a.coverage ?? 0) - (b.coverage ?? 0) : (b.coverage ?? 0) - (a.coverage ?? 0),
    )[0] ?? null;

  // The buy-side largest gap still drives the outbound sector link, which is about the
  // country rather than about the lens.
  const largestGap =
    [...balances]
      .filter((row) => row.gap !== null && row.gap > 0)
      .sort((a, b) => (b.gap ?? 0) - (a.gap ?? 0))[0] ?? null;

  const tariff = avgTariff(iso);
  const series = seriesFor(iso);

  /*
   * The two second-source overlays. Both are null-safe: the Comtrade build is a separate
   * pipeline, and a repo that has only run the WITS one still renders this whole page.
   */
  const avMeta = aviationMeta();
  const avRows = avMeta ? aviationFor(iso) : [];
  const aviation =
    avMeta && avRows.length
      ? {
          group: avMeta.withinGroup,
          rows: avRows,
          source: avMeta.source,
          vintage: avMeta.vintage,
        }
      : null;

  const frMeta = frontierMeta();
  const frontier = frMeta
    ? frontierYears().map((y) => {
        const slot = frontierFor(iso, y.year);
        return {
          year: y.year,
          exports: slot.x,
          imports: slot.m,
          reporters: y.reporters,
          complete: y.complete,
        };
      })
    : [];

  const relatedLinks: RelatedLink[] = [
    toCountry(iso, country.name),
    largestGap ? toSector(largestGap.code, largestGap.name) : null,
    toTariffs(iso, country.name),
    // The mirror question: this page says what a market lacks, the opportunity engine
    // says who could fill it. Pointing the engine AT this country as a destination is not
    // expressible in its URL - it scores one origin against every market - so the honest
    // link is the engine run from this country outward, plus the sector page above for
    // the supplier side.
    toOpportunities(iso, country.name),
    toExplore(`?country=${iso}&view=connections`, country.name),
    TO_SOURCE,
  ].filter((link): link is RelatedLink => link !== null);

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-5 lg:px-6">
      {header}
      {controls}

      {/* ---- headline figures ---- */}
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          icon={<ArrowDownToLine className="h-3 w-3" aria-hidden />}
          label="Goods imports"
          value={usd(totals.m ?? null)}
          delta={growth(totals.m ?? null, previous.m)}
          deltaLabel={`vs ${year - 1} · country total`}
        />
        <Stat
          icon={<ScaleIcon className="h-3 w-3" aria-hidden />}
          label="Buys more than it sells in"
          value={`${netBuyer} of ${balances.length}`}
          hint={`sector groups · sells more in ${netSeller}`}
        />
        <Stat
          icon={<Boxes className="h-3 w-3" aria-hidden />}
          label={buying ? "Largest gap" : "Largest surplus"}
          value={extreme ? extreme.name : "-"}
          hint={
            extreme?.gap
              ? `${buying ? "buys" : "sells"} ${usd(Math.abs(extreme.gap))} more than it ${buying ? "sells" : "buys"}`
              : "none"
          }
        />
        <Stat
          icon={<Gauge className="h-3 w-3" aria-hidden />}
          label={buying ? "Thinnest coverage" : "Strongest coverage"}
          value={edge?.coverage != null ? pct(edge.coverage, 0) : "-"}
          hint={
            edge
              ? `of what it buys in ${edge.name.toLowerCase()}`
              : "not computable"
          }
        />
      </div>

      {/*
        The caveat sits ABOVE the figures it qualifies, not in a footnote below them. It is
        the single misreading this page invites, and a reader who meets it after the
        numbers has already formed the wrong conclusion.
      */}
      <div className="mt-3">
        <Warn>
          <strong>This is net reliance measured at customs, not unmet demand.</strong> There
          is no production series in this build, so a large gap means {country.name} buys
          more of a group than it sells - never that it cannot make any. A country can be
          the world&apos;s largest producer of something and still buy more of it than it
          ships out.
        </Warn>
      </div>

      {/* Later years, kept visibly apart from the build the rest of the page uses. */}
      {frMeta && frontier.some((r) => r.exports !== null || r.imports !== null) && (
        <div className="mt-3">
          <FrontierNote
            readings={frontier}
            baseYear={year}
            baseExports={totals.x ?? null}
            baseImports={totals.m ?? null}
            countryName={country.name}
            source={frMeta.source}
            vintage={frMeta.vintage}
          />
        </div>
      )}

      <div className="mt-3">
        <NeedsExplorer
          ranked={ranked}
          pictures={pictures}
          contents={contents}
          countryName={country.name}
          countryIso={iso}
          reporterIso={iso}
          lens={lens}
          aviation={aviation}
        />
      </div>

      {/* ---- the long view, at the country-total grain ---- */}
      <div className="mt-3">
        <TradeSeries
          data={series}
          reporterName={country.name}
          title="The balance over time"
          subtitle={`${series[0]?.year ?? ""}-${series[series.length - 1]?.year ?? ""} · ${country.name} against the whole world · country totals, not the sector cube`}
        />
      </div>

      {/* ---- what this page can and cannot answer ---- */}
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="card p-4">
          <h2 className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-ink-muted">
            <Percent className="h-3 w-3" aria-hidden />
            How to read the gap
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Fact
              icon={<Info className="h-3 w-3" aria-hidden />}
              label="The gap"
              value="Imports minus exports"
              hint="Within one HS section group. Null unless both sides are reported - an absent figure is never treated as zero."
            />
            <Fact
              icon={<Info className="h-3 w-3" aria-hidden />}
              label="Coverage"
              value="Exports / imports"
              hint="Same group. The more useful figure for comparing countries, since the dollar gap alone just ranks large economies and large groups first."
            />
            <Fact
              icon={<Info className="h-3 w-3" aria-hidden />}
              label="Concentration"
              value="Herfindahl index"
              hint="Over every reported supplier's share. A high number means a handful of countries carry the gap - a different kind of exposure than the gap being large."
            />
            <Fact
              icon={<Info className="h-3 w-3" aria-hidden />}
              label="Tariff shown per supplier"
              value={tariff === null ? "Not published" : pct(tariff)}
              hint={`What ${country.name} charges that partner across all products, not this group specifically - no per-sector rate is published at this tier.`}
            />
          </div>
        </div>

        <div className="card p-4">
          <h2 className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-ink-muted">
            <TriangleAlert className="h-3 w-3" aria-hidden />
            What it cannot tell you
          </h2>
          <div className="mt-3">
            <CaveatList
              items={[
                <>
                  <strong className="text-ink-secondary">Nothing about domestic production.</strong>{" "}
                  Customs data records border crossings. A country with vast domestic output and
                  modest imports shows a small gap; that is not evidence it needs less of the
                  thing.
                </>,
                <>
                  <strong className="text-ink-secondary">
                    Almost nothing about individual products.
                  </strong>{" "}
                  The grain is the HS section group, sixteen of them. The one exception is
                  aircraft: HS chapter 88 is carried as a labelled subset inside Transport,
                  because it is revision-stable and could be sourced separately. Every other
                  chapter list on this page is nomenclature and carries no figures. Broader
                  per-product detail needs HS-6 lines, which is still a V2 data decision.
                </>,
                <>
                  <strong className="text-ink-secondary">
                    Little about the years after {year}.
                  </strong>{" "}
                  The sector cube is published for {year} only, so no group on this page
                  carries a year-on-year change. Country totals for later years come from a
                  second source and are shown in their own strip above, never spliced onto the
                  series.
                </>,
                <>
                  <strong className="text-ink-secondary">Nothing about why.</strong> Freight,
                  certification, quotas and licensing do not appear in any of these figures.{" "}
                  <Link href="/source" className="text-series-1 hover:underline">
                    No inventory of non-tariff measures is published
                  </Link>{" "}
                  at all.
                </>,
              ]}
            />
          </div>
        </div>
      </div>

      <RelatedViews
        links={relatedLinks}
        hint={`The same build, ${country.name} from the other side`}
      />

      <div className="card mt-3 overflow-hidden">
        <ProvenanceBar meta={meta} extra={`${country.name} · sector detail ${year}`} />
      </div>
    </div>
  );
}
