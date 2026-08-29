import Link from "next/link";
import { ArrowLeftRight, Boxes, Compass, Globe2, Layers, Route } from "lucide-react";
import {
  allCountries,
  allRegions,
  bilateralValue,
  corridorSectors,
  countCorridors,
  dataset,
  findCorridors,
  getCountry,
  latestYear,
  provenance,
  sectorCountryRanking,
  sectorOverview,
  sectorSummary,
  tariffApplied,
} from "@/lib/data";
import { CaveatList, ProvenanceBar, Stat } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { RelatedViews } from "@/components/related-views";
import {
  TO_SOURCE,
  toCorridor,
  toCountry,
  toMap,
  toOpportunities,
  toSector,
  toTariffs,
  type RelatedLink,
} from "@/lib/views";
import { ExploreControls, CorridorComparePicker } from "@/components/explore-controls";
import { ExploreTabs } from "@/components/explore-tabs";
import { SectorWorldTable } from "@/components/charts/sector-world-table";
import { CorridorTable } from "@/components/charts/corridor-table";
import {
  ConnectionCompare,
  type ConnectionSummary,
} from "@/components/charts/connection-compare";
import { PartnerCompare } from "@/components/charts/partner-compare";
import { usd } from "@/lib/format";
import type { PartnerPair } from "@/lib/pairing";

export const metadata = {
  title: "World trade explorer - WorldTradeWeb",
  description:
    "Every sector and every connection in world trade, filterable by sector, country, region and size, with a side-by-side comparison of any two connections.",
};

/** Corridors listed at once. Beyond this the table stops being scannable. */
const CORRIDOR_LIMIT = 60;
/** Sectors shown per corridor in the comparison cards. */
const COMPARE_SECTORS = 6;

/**
 * The world trade explorer.
 *
 * Every other screen in this app is anchored to something - one country, one corridor,
 * one product. This one is anchored to nothing: it starts from the whole cube and lets
 * the reader cut it down. That is why the filters are the first thing on the page and why
 * the sector table shows all sixteen groups at once rather than a chosen one.
 *
 * A server component, and the filters navigate rather than filtering in the browser. The
 * corridor cube is 435,000 slices; shipping it to the client so the reader can narrow it
 * to sixty rows would trade six megabytes for work the server does in a few milliseconds.
 */
export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (key: string) => {
    const v = params[key];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };

  const sector = one("sector");
  const country = one("country").toUpperCase();
  const region = one("region");
  const min = Number(one("min")) || 0;

  const year = latestYear();
  const meta = provenance();

  const countries = allCountries()
    .map((c) => ({ iso3: c.iso3, iso2: c.iso2, name: c.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const names = Object.fromEntries(allCountries().map((c) => [c.iso3, c.name]));
  const iso2 = Object.fromEntries(allCountries().map((c) => [c.iso3, c.iso2]));

  const overview = sectorOverview();
  const chosen = sector ? sectorSummary(sector) : null;

  const query = { sector, country, region, minValue: min };
  const corridors = findCorridors({ ...query, limit: CORRIDOR_LIMIT });
  const matched = countCorridors(query);

  // Headline figures follow the sector lens. With no sector this is the whole cube.
  const worldTrade = chosen
    ? chosen.worldTrade
    : overview.reduce((sum, s) => sum + s.worldTrade, 0);

  /**
   * Country ranking within the chosen sector, reusing the partner-list component.
   *
   * `variant="country"` is the one that treats each row as a country's OWN two sides
   * rather than as a corridor from some origin - which is what these rows are.
   */
  const ranking: PartnerPair[] = chosen
    ? sectorCountryRanking(chosen.code, 14).map((row) => ({
        iso3: row.iso,
        name: names[row.iso] ?? row.iso,
        iso2: iso2[row.iso] ?? null,
        exports: row.exports,
        imports: row.imports,
        net: row.exports !== null && row.imports !== null ? row.exports - row.imports : null,
      }))
    : [];

  const left = buildConnection(one("a").toUpperCase(), one("b").toUpperCase());
  const right = buildConnection(one("c").toUpperCase(), one("d").toUpperCase());

  /**
   * Handing the reader off to a subject.
   *
   * These follow the FILTERS, not a fixed list: narrowing to one sector should offer that
   * sector's own page, and naming a country should offer that country's. With nothing set
   * they fall back to the largest corridor currently listed, which is at least a real row
   * the reader can see above.
   */
  const filteredCountry = country ? getCountry(country) : null;
  const topCorridor = corridors[0] ?? null;
  const relatedLinks: RelatedLink[] = [
    chosen ? toSector(chosen.code, chosen.name) : null,
    filteredCountry ? toCountry(filteredCountry.iso3, filteredCountry.name) : null,
    topCorridor
      ? toCorridor(
          topCorridor.reporter,
          topCorridor.partner,
          names[topCorridor.reporter] ?? topCorridor.reporter,
          names[topCorridor.partner] ?? topCorridor.partner,
        )
      : null,
    filteredCountry ? toTariffs(filteredCountry.iso3, filteredCountry.name) : null,
    filteredCountry ? toOpportunities(filteredCountry.iso3, filteredCountry.name) : null,
    toMap(filteredCountry ? `?focus=${filteredCountry.iso3}` : ""),
    TO_SOURCE,
  ].filter((link): link is RelatedLink => link !== null);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-5 lg:px-6">
      <PageHeader
        crumb={[{ label: "Map", href: "/" }, { label: "Explore" }]}
        view="explore"
        title="World trade explorer"
        subject={<Compass className="h-5 w-5 text-ink-muted" aria-hidden />}
        meta={`${year} · the whole cube, before anything is selected`}
        lede="Narrow it by sector, by a country at either end, by region or by size, then move between the three panes below - and send any connection you find straight into the comparison."
      />

      <div className="mt-4">
        <ExploreControls countries={countries} regions={allRegions()} />
      </div>

      {/* ---- headline figures, following the lens ---- */}
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          icon={<Globe2 className="h-3 w-3" aria-hidden />}
          label={chosen ? `${chosen.name} worldwide` : "World trade, all sectors"}
          value={usd(worldTrade)}
          hint={`${year} · summed from reporting countries`}
        />
        <Stat
          icon={<Route className="h-3 w-3" aria-hidden />}
          label="Connections matching"
          value={matched.toLocaleString("en-US")}
          hint={
            matched > CORRIDOR_LIMIT
              ? `showing the top ${CORRIDOR_LIMIT}`
              : "all shown below"
          }
        />
        <Stat
          icon={<Boxes className="h-3 w-3" aria-hidden />}
          label={chosen ? "Countries selling it" : "Sectors tracked"}
          value={chosen ? String(chosen.exporters) : String(overview.length)}
          hint={chosen ? `${chosen.importers} countries buying` : "HS section groups"}
        />
        <Stat
          icon={<Layers className="h-3 w-3" aria-hidden />}
          label={chosen ? "Supplier concentration" : "Largest sector"}
          value={
            chosen
              ? chosen.hhi === null
                ? "-"
                : String(Math.round(chosen.hhi))
              : (overview[0]?.name ?? "-")
          }
          hint={
            chosen
              ? chosen.hhi === null
                ? "not computable"
                : chosen.hhi > 2500
                  ? "few suppliers dominate"
                  : chosen.hhi > 1500
                    ? "moderately concentrated"
                    : "many suppliers"
              : usd(overview[0]?.worldTrade ?? 0)
          }
        />
      </div>

      {/*
        Three panes, one filtered result set. Each subtree is rendered HERE, on the server,
        and handed to a client shell that only decides which is on screen - so switching
        panes never refetches anything, and the 435k-slice cube never leaves this process.
      */}
      <div className="mt-4">
        <ExploreTabs
          counts={{ sectors: overview.length, connections: matched }}
          sectors={
            <div className="space-y-3">
              <SectorWorldTable rows={overview} />

              {/* Who trades the chosen sector. Only meaningful once one is chosen. */}
              {chosen && ranking.length > 0 && (
                <PartnerCompare
                  rows={ranking}
                  variant="country"
                  title={`Who trades ${chosen.name.toLowerCase()}`}
                  subtitle={`${year} · each country's own selling against its own buying, ranked by the two combined`}
                  limit={14}
                />
              )}

              <div className="card p-4">
                <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">
                  What the sector figures measure
                </h2>
                <div className="mt-2 space-y-2 text-xs leading-relaxed text-ink-secondary">
                  <p>
                    Each sector total is the sum of every corridor in that sector, taken
                    from the seller&apos;s own report. Around thirty economies - Russia
                    among them - publish no export figures at all; for those the
                    buyer&apos;s customs record stands in, and any row using it says so.
                  </p>
                  <p>
                    Sector groups are HS section aggregates, not HS-6 lines. They are
                    stable across HS revisions, which is why a figure here can be compared
                    year to year, but they cannot be drilled into a specific product.
                  </p>
                </div>
              </div>
            </div>
          }
          connections={
            <div className="space-y-3">
              <CorridorTable
                rows={corridors}
                total={matched}
                names={names}
                iso2={iso2}
                sectorName={chosen?.name ?? null}
              />

              <div className="card p-4">
                <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">
                  Why totals here differ from a country page
                </h2>
                <div className="mt-2">
                  <CaveatList
                    items={[
                      <>
                        WITS computes corridor totals and corridor-by-sector totals as
                        separate aggregations, and the two do not always agree exactly.
                      </>,
                      <>
                        Nothing on this page is scaled to make them match: with no sector
                        selected the list reads corridor totals, and with one selected it
                        reads the sector cube instead.
                      </>,
                      <>
                        A country page reports what that country itself declares, while a
                        connection here is attributed to whoever sold the goods, so the
                        same trade can appear under a different number on the two screens.
                        Both are real;{" "}
                        <Link href="/source" className="text-series-1 hover:underline">
                          the source page
                        </Link>{" "}
                        sets out which is which.
                      </>,
                    ]}
                  />
                </div>
              </div>
            </div>
          }
          compare={
            <section>
              <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
                <ArrowLeftRight className="h-4 w-4 text-ink-muted" aria-hidden />
                Compare two connections
              </h2>
              <div className="mt-1 max-w-3xl">
                <CaveatList
                  items={[
                    <>
                      Both cards share one scale, so a bar is the same length for the same
                      value in either of them.
                    </>,
                    <>
                      Pick the two connections here, or hit &quot;Compare&quot; on any row
                      in the connections pane to send it straight into a slot.
                    </>,
                    <>
                      Sector splits come from each seller&apos;s own report; where a
                      country publishes nothing, its side comes from the other
                      country&apos;s customs record and is labelled - a provenance
                      separate from the headline total above it.
                    </>,
                  ]}
                />
              </div>

              <div className="card mt-3 p-3">
                <CorridorComparePicker countries={countries} />
              </div>

              <div className="mt-3">
                <ConnectionCompare left={left} right={right} />
              </div>
            </section>
          }
        />
      </div>

      {/*
        The explorer is where readers arrive without a subject in mind, so it is the page
        most likely to end with one - and it had no way of handing them over. These follow
        whatever the filters are currently set to, so a reader who has narrowed to one
        sector or one country is offered that subject's own screens rather than a list.
      */}
      <RelatedViews
        links={relatedLinks}
        hint={
          chosen || country
            ? "Following the filters currently set above"
            : "Pick a filter above and these follow it"
        }
      />

      <div className="mt-4">
        <ProvenanceBar meta={meta} extra={`${year} · ${matched.toLocaleString("en-US")} connections matched`} />
      </div>
    </div>
  );
}

/**
 * Assemble one side of the comparison.
 *
 * Both directions come from the seller's books; the mirror travels alongside so the card
 * can flag a disagreement rather than hide it behind an average.
 */
function buildConnection(a: string, b: string): ConnectionSummary | null {
  if (!a || !b || a === b) return null;
  const ca = getCountry(a);
  const cb = getCountry(b);
  if (!ca || !cb) return null;

  const { nonReporters } = dataset();
  const aToB = bilateralValue(a, b, "x");
  const bToA = bilateralValue(b, a, "x");
  const aToBMirror = bilateralValue(b, a, "m");

  const outbound = corridorSectors(a, b, "x");
  const inbound = corridorSectors(b, a, "x");
  const bySector = new Map<
    string,
    { code: string; name: string; aToB: number | null; bToA: number | null }
  >();
  for (const row of outbound) {
    bySector.set(row.code, { code: row.code, name: row.name, aToB: row.value, bToA: null });
  }
  for (const row of inbound) {
    const existing = bySector.get(row.code);
    if (existing) existing.bToA = row.value;
    else bySector.set(row.code, { code: row.code, name: row.name, aToB: null, bToA: row.value });
  }

  return {
    a: { iso3: ca.iso3, iso2: ca.iso2, name: ca.name },
    b: { iso3: cb.iso3, iso2: cb.iso2, name: cb.name },
    aToB,
    bToA,
    balance: aToB !== null && bToA !== null ? aToB - bToA : null,
    mirrorGapPct:
      aToB !== null && aToBMirror !== null && aToB > 0
        ? ((aToBMirror - aToB) / aToB) * 100
        : null,
    tariffAOnB: tariffApplied(a, b),
    tariffBOnA: tariffApplied(b, a),
    // Ranked by both directions combined, never by one side.
    sectors: [...bySector.values()]
      .sort((x, y) => (y.aToB ?? 0) + (y.bToA ?? 0) - ((x.aToB ?? 0) + (x.bToA ?? 0)))
      .slice(0, COMPARE_SECTORS),
    buyerSourced: nonReporters.has(a) || nonReporters.has(b),
  };
}
