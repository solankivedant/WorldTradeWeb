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
import { Crumb, ProvenanceBar, Stat } from "@/components/ui";
import { ExploreControls, CorridorComparePicker } from "@/components/explore-controls";
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
    .map((c) => ({ iso3: c.iso3, name: c.name }))
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

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-5 lg:px-6">
      <Crumb items={[{ label: "Map", href: "/" }, { label: "Explore" }]} />

      <h1 className="mt-2 flex items-center gap-2 text-2xl font-semibold tracking-tight">
        <Compass className="h-5 w-5 text-ink-muted" aria-hidden />
        World trade explorer
      </h1>
      <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-ink-secondary">
        Every sector and every connection at once, with no country selected first. Narrow
        it by sector, by a country at either end, by region or by size - or put any two
        connections side by side further down.
      </p>

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

      {/* ---- all sectors, irrespective of connection ---- */}
      <div className="mt-3">
        <SectorWorldTable rows={overview} />
      </div>

      {/* ---- the filtered corridor list ---- */}
      <div className="mt-3">
        <CorridorTable
          rows={corridors}
          total={matched}
          names={names}
          iso2={iso2}
          sectorName={chosen?.name ?? null}
        />
      </div>

      {/* ---- who trades the chosen sector ---- */}
      {chosen && ranking.length > 0 && (
        <div className="mt-3">
          <PartnerCompare
            rows={ranking}
            variant="country"
            title={`Who trades ${chosen.name.toLowerCase()}`}
            subtitle={`${year} · each country's own selling against its own buying, ranked by the two combined`}
            limit={14}
          />
        </div>
      )}

      {/* ---- connection against connection ---- */}
      <section className="mt-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <ArrowLeftRight className="h-4 w-4 text-ink-muted" aria-hidden />
          Compare two connections
        </h2>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-ink-muted">
          Both cards share one scale, so a bar is the same length for the same value in
          either of them. Sector splits come from each seller&apos;s own report; where a
          country publishes nothing, its side comes from the other country&apos;s customs
          record and is labelled.
        </p>

        <div className="card mt-3 p-3">
          <CorridorComparePicker countries={countries} />
        </div>

        <div className="mt-3">
          <ConnectionCompare left={left} right={right} />
        </div>
      </section>

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        <div className="card p-4">
          <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">
            What the sector figures measure
          </h2>
          <div className="mt-2 space-y-2 text-xs leading-relaxed text-ink-secondary">
            <p>
              Each sector total is the sum of every corridor in that sector, taken from
              the seller&apos;s own report. Around thirty economies - Russia among them -
              publish no export figures at all; for those the buyer&apos;s customs record
              stands in, and any row using it says so.
            </p>
            <p>
              Sector groups are HS section aggregates, not HS-6 lines. They are stable
              across HS revisions, which is why a figure here can be compared year to
              year, but they cannot be drilled into a specific product.
            </p>
          </div>
        </div>
        <div className="card p-4">
          <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">
            Why totals here differ from a country page
          </h2>
          <div className="mt-2 space-y-2 text-xs leading-relaxed text-ink-secondary">
            <p>
              WITS computes corridor totals and corridor-by-sector separately, and the two
              aggregations do not always agree. Nothing on this page is scaled to make
              them match - with no sector selected the list reads corridor totals, and
              with one selected it reads the sector cube.
            </p>
            <p>
              A country page reports what that country itself declares. Here a connection
              is attributed to whoever sold the goods, so the same trade can appear under
              a different number on the two screens. Both are real;{" "}
              <Link href="/source" className="text-series-1 hover:underline">
                the source page
              </Link>{" "}
              sets out which is which.
            </p>
          </div>
        </div>
      </div>

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
