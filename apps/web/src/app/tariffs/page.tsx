import Link from "next/link";
import { allCountries, avgTariff, dataset, getCountry, latestYear, provenance } from "@/lib/data";
import { TariffExplorer } from "@/components/tariff-explorer";
import { TariffBands, type RateBand } from "@/components/charts/tariff-bands";
import { TariffRegions, type RegionRate } from "@/components/charts/tariff-regions";
import {
  ArrowUpRight,
  BookOpen,
  CircleCheck,
  Gauge,
  Percent,
  TriangleAlert,
  Users,
} from "lucide-react";
import { Crumb, ProvenanceBar, Warn } from "@/components/ui";
import { pct } from "@/lib/format";
import { CountryFlag } from "@/components/country-flag";
import { TARIFF_BAND_META } from "@/lib/palette";

export const metadata = { title: "Tariff explorer - WorldTradeWeb" };

/**
 * Band edges, labels and colours all come from `TARIFF_BAND_META` / `tariffBands` in the
 * palette. They are the same six steps everywhere on this page - the distribution chart,
 * the region bars, the table pills and the band filter - so one rate never wears two
 * colours or two names. The edges themselves match how rates actually cluster rather than
 * round tenths: the mass of any schedule sits between 0 and 15, and the tail above that is
 * one group.
 */
const DUTY_FREE_EDGE = TARIFF_BAND_META[0].max;

export default async function TariffsPage({
  searchParams,
}: {
  searchParams: Promise<{ reporter?: string; partner?: string }>;
}) {
  const sp = await searchParams;
  const reporter = (sp.reporter ?? "USA").toUpperCase();
  const focusPartner = sp.partner?.toUpperCase() ?? "";

  const country = getCountry(reporter);
  const year = latestYear();
  const rates = dataset().tariffs[reporter] ?? {};

  const rows = Object.entries(rates)
    .map(([iso3, rate]) => {
      const partner = getCountry(iso3);
      return {
        iso3,
        name: partner?.name ?? iso3,
        iso2: partner?.iso2 ?? null,
        region: partner?.region ?? null,
        rate,
      };
    })
    .sort((a, b) => a.rate - b.rate);

  const countries = allCountries()
    .filter((c) => Object.keys(dataset().tariffs[c.iso3] ?? {}).length > 0)
    .map((c) => ({ iso3: c.iso3, name: c.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const average = avgTariff(reporter);
  const zeroRated = rows.filter((r) => r.rate < DUTY_FREE_EDGE).length;
  const highest = rows.length ? rows[rows.length - 1] : null;

  const bands: RateBand[] = TARIFF_BAND_META.map((b) => ({
    label: b.label,
    hint: b.range,
    count: 0,
    dutyFree: b.dutyFree,
  }));
  for (const row of rows) {
    const index = TARIFF_BAND_META.findIndex((b) => row.rate < b.max);
    bands[index === -1 ? bands.length - 1 : index].count += 1;
  }

  // Region averages. Partners whose region the reference set does not carry are grouped
  // rather than dropped - a silently shorter chart is worse than an honest "Unclassified".
  const regionTotals = new Map<string, { sum: number; count: number }>();
  for (const row of rows) {
    const key = row.region ?? "Unclassified";
    const entry = regionTotals.get(key) ?? { sum: 0, count: 0 };
    entry.sum += row.rate;
    entry.count += 1;
    regionTotals.set(key, entry);
  }
  const regions: RegionRate[] = [...regionTotals.entries()]
    .map(([region, { sum, count }]) => ({ region, average: sum / count, count }))
    .sort((a, b) => b.average - a.average);

  const steepest = [...rows].sort((a, b) => b.rate - a.rate).slice(0, 6);

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-5 lg:px-6">
      <Crumb items={[{ label: "Map", href: "/" }, { label: "Tariffs" }]} />

      <div className="mt-2">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Percent className="h-5 w-5 text-ink-muted" aria-hidden />
          Tariff explorer
        </h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-secondary">
          What {country?.name ?? reporter} charges its trading partners, as an effectively
          applied simple average across all products.
        </p>
      </div>

      {/* ---- headline figures ---- */}
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          icon={<Gauge className="h-3.5 w-3.5" aria-hidden />}
          accent="bg-series-1/15 text-series-1"
          label="Average applied"
          value={average === null ? "-" : pct(average)}
          hint="across every partner with a published rate"
        />
        <Kpi
          icon={<Users className="h-3.5 w-3.5" aria-hidden />}
          accent="bg-series-7/15 text-series-7"
          label="Partners with a rate"
          value={rows.length.toLocaleString("en-US")}
          hint="published country pairs"
        />
        <Kpi
          icon={<CircleCheck className="h-3.5 w-3.5" aria-hidden />}
          accent="bg-status-good/15 text-status-good"
          label="Effectively duty-free"
          value={String(zeroRated)}
          hint={
            rows.length
              ? `${((zeroRated / rows.length) * 100).toFixed(0)}% of partners, ${TARIFF_BAND_META[0].range}`
              : TARIFF_BAND_META[0].range
          }
        />
        <Kpi
          icon={<ArrowUpRight className="h-3.5 w-3.5" aria-hidden />}
          accent="bg-series-2/15 text-series-2"
          label="Highest rate"
          value={highest ? pct(highest.rate) : "-"}
          hint={highest ? `charged to ${highest.name}` : "no rates published"}
        />
      </div>

      {rows.length === 0 ? (
        <div className="card mt-3 p-8 text-center text-sm text-ink-muted">
          No tariff schedule is published for {country?.name ?? reporter}. Pick another
          reporter below.
        </div>
      ) : (
        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          <section className="card lg:col-span-2">
            <h2 className="card-title">How the schedule is distributed</h2>
            <div className="px-4 pb-4">
              <TariffBands bands={bands} total={rows.length} />
            </div>
          </section>

          <section className="card">
            <h2 className="card-title">Steepest rates</h2>
            <ul className="px-4 pb-4">
              {steepest.map((row) => (
                <li key={row.iso3} className="border-b border-hairline/60 py-1.5 last:border-0">
                  <Link
                    href={`/corridor/${row.iso3}/${reporter}`}
                    className="flex items-center justify-between gap-2 text-xs hover:underline"
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <CountryFlag iso2={row.iso2} name={row.name} size="sm" />
                      <span className="truncate text-ink-secondary">{row.name}</span>
                    </span>
                    <span className="tabular shrink-0 font-medium text-ink">{pct(row.rate)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section className="card lg:col-span-3">
            <h2 className="card-title">Average rate by partner region</h2>
            <div className="px-4 pb-4">
              <TariffRegions regions={regions} />
            </div>
          </section>
        </div>
      )}

      <div className="mt-3">
        <TariffExplorer
          countries={countries}
          reporter={reporter}
          reporterName={country?.name ?? reporter}
          rows={rows}
          focusPartner={focusPartner}
        />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="card p-4">
          <h2 className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-ink-muted">
            <BookOpen className="h-3 w-3" aria-hidden />
            What &quot;effectively applied&quot; means
          </h2>
          <div className="mt-3 space-y-2 text-xs leading-relaxed text-ink-muted">
            <p>
              The effectively applied rate is the lowest rate a partner actually faces: a
              preferential rate where a trade agreement grants one, otherwise the MFN rate.
              It is not the bound rate (the ceiling a country committed to at the WTO),
              which is usually much higher and rarely charged.
            </p>
            <p>
              A near-zero average almost always means a free trade agreement or customs
              union is in force between the two.
            </p>
          </div>
        </div>

        <div className="card p-4">
          <h2 className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-ink-muted">
            <TriangleAlert className="h-3 w-3" aria-hidden />
            Limits of a simple average
          </h2>
          <div className="mt-3 space-y-3">
            <Warn>
              These are simple averages across all product lines - unweighted by how much
              is actually traded. A country with a 3% average can still charge 40% on the
              specific product you ship.
            </Warn>
            <p className="text-xs leading-relaxed text-ink-muted">
              A preferential rate also usually requires meeting rules of origin, which
              this figure does not capture. And tariffs are only one trade cost: quotas,
              licensing, standards, and certification requirements do not appear here at
              all. For a shipping decision, verify the specific HS line with the
              destination&apos;s customs authority.
            </p>
            <p className="text-xs leading-relaxed text-ink-muted">
              The band chart above counts partners, not trade. A schedule where most
              partners are duty-free can still collect most of its duty from the handful
              that are not.
            </p>
          </div>
        </div>
      </div>

      <div className="card mt-3 overflow-hidden">
        <ProvenanceBar meta={provenance()} extra={`${country?.name ?? reporter} · ${year}`} />
      </div>
    </div>
  );
}

function Kpi({
  icon,
  accent,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  accent: string;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="card flex items-start gap-3 px-4 py-3">
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${accent}`}>
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">
          {label}
        </div>
        <div className="mt-1 text-2xl font-semibold leading-none">{value}</div>
        <div className="mt-1.5 text-2xs leading-snug text-ink-muted">{hint}</div>
      </div>
    </div>
  );
}
