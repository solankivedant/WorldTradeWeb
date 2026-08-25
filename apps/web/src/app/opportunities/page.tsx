import Link from "next/link";
import { allCountries, getCountry, latestYear, provenance } from "@/lib/data";
import {
  findOpportunities,
  marketFloor,
  MARKET_FLOORS,
  sectorsForOrigin,
  WEIGHTS,
} from "@/lib/opportunity";
import { OpportunityControls } from "@/components/opportunity-controls";
import { OpportunityBoard } from "@/components/opportunity-board";
import {
  Calculator,
  ChevronDown,
  Globe2,
  Layers,
  Lightbulb,
  ShieldAlert,
  Sparkles,
  Target,
} from "lucide-react";
import { Empty, ProvenanceBar, Warn } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { RelatedViews } from "@/components/related-views";
import {
  TO_SOURCE,
  toCorridor,
  toCountry,
  toExplore,
  toSector,
  toTariffs,
  type RelatedLink,
} from "@/lib/views";
import { usd } from "@/lib/format";

export const metadata = { title: "Trade opportunities - WorldTradeWeb" };

/** How many cards a page shows before the reader asks for more. */
const PAGE_SIZE = 60;
const MAX_CARDS = 300;

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ origin?: string; sector?: string; floor?: string; n?: string }>;
}) {
  const sp = await searchParams;
  const origin = (sp.origin ?? "IND").toUpperCase();
  const sector = sp.sector ?? "";
  const floor = marketFloor(sp.floor);
  const limit = Math.min(MAX_CARDS, Math.max(PAGE_SIZE, Number(sp.n) || PAGE_SIZE));

  const country = getCountry(origin);
  const year = latestYear();
  const meta = provenance();

  const countries = allCountries()
    .map((c) => ({ iso3: c.iso3, iso2: c.iso2, name: c.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const scan = country
    ? findOpportunities({ origin, sector: sector || undefined, minMarket: floor.min, limit })
    : null;
  const results = scan?.items ?? [];
  const sectors = country ? sectorsForOrigin(origin) : [];

  const isDefault = !sector && (!sp.floor || sp.floor === floor.id) && floor.id === "broad";
  const topScore = results.length ? results[0].score : null;

  // "Show more" is a plain link so it is a real permalink and gets the route progress bar.
  /**
   * Where to take a card. Built from the top-scoring result rather than a fixed list, so
   * the corridor and the destination named here are the ones the reader is looking at.
   */
  const best = results[0] ?? null;
  const originName = country?.name ?? origin;
  const relatedLinks: RelatedLink[] = [
    best ? toCountry(best.destination, best.destinationName) : null,
    best
      ? toCorridor(origin, best.destination, originName, best.destinationName)
      : null,
    best ? toSector(best.sector, best.sectorName) : null,
    best ? toTariffs(best.destination, best.destinationName, origin) : null,
    toCountry(origin, originName),
    toExplore(`?country=${origin}&view=connections`, originName),
    TO_SOURCE,
  ].filter((link): link is RelatedLink => link !== null);

  const moreParams = new URLSearchParams();
  if (sp.origin) moreParams.set("origin", origin);
  if (sector) moreParams.set("sector", sector);
  if (sp.floor) moreParams.set("floor", floor.id);
  moreParams.set("n", String(Math.min(MAX_CARDS, limit + PAGE_SIZE)));

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-5 lg:px-6">
      <PageHeader
        crumb={[
          { label: "Map", href: "/" },
          { label: "Opportunities", href: "/opportunities" },
          { label: country?.name ?? origin },
        ]}
        view="opportunities"
        title="Trade opportunities"
        subject={<Lightbulb className="h-5 w-5 text-ink-muted" aria-hidden />}
        meta={
          <>
            Selling from{" "}
            <span className="tabular font-medium text-ink-secondary">{origin}</span> ·
            scored against every market that reports imports
          </>
        }
        lede={`Every card is one sector in one destination, and every score shows its own arithmetic - open a card to see which inputs drove it. Nothing here is measured demand for ${country?.name ?? origin} specifically; it is a gap between what a market buys and what this country already sells it.`}
      />

      <div className="mt-4">
        <OpportunityControls
          countries={countries}
          sectors={sectors}
          floors={MARKET_FLOORS.map((f) => ({ id: f.id, label: f.label }))}
          origin={origin}
          sector={sector}
          floor={floor.id}
          isDefault={isDefault}
        />
      </div>

      {!country ? (
        <div className="card mt-4">
          <Empty message={`No country matches "${origin}".`} hint="Pick an origin above." />
        </div>
      ) : results.length === 0 ? (
        <div className="card mt-4">
          <Empty
            message={`No opportunities cleared the thresholds for ${country.name}${
              sector ? " in this sector" : ""
            }.`}
            hint={
              sector
                ? "The sector filter is likely too narrow. Try 'All sectors', or widen the market coverage."
                : "This usually means the country's reported export base is too small to clear the minimum capability guardrail. Widening market coverage will not help - that guardrail is about the origin, not the destination."
            }
          />
        </div>
      ) : (
        <>
          {/*
            Coverage, stated up front. The engine scores every reporting country and then
            shows a diversified slice, so "36 cards" on its own left the reader unable to
            tell a thin result from a deep one that had simply been sampled. These four
            figures say how wide the search actually was.
          */}
          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Coverage
              icon={<Sparkles className="h-3 w-3" aria-hidden />}
              label="Opportunities found"
              value={scan ? scan.total.toLocaleString("en-US") : "-"}
              hint={`showing the top ${results.length}`}
            />
            <Coverage
              icon={<Globe2 className="h-3 w-3" aria-hidden />}
              label="Destination markets"
              value={scan ? String(scan.destinations) : "-"}
              hint={`of ${scan?.destinationsConsidered ?? 0} countries that report imports`}
            />
            <Coverage
              icon={<Layers className="h-3 w-3" aria-hidden />}
              label="Sectors in play"
              value={scan ? String(scan.sectors) : "-"}
              hint={`markets from ${usd(floor.min, 0)} up`}
            />
            <Coverage
              icon={<Target className="h-3 w-3" aria-hidden />}
              label="Best score"
              value={topScore === null ? "-" : String(topScore)}
              hint="out of 100"
            />
          </div>

          <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-2xs text-ink-muted">
            <span>
              Weights: market size {WEIGHTS.demandSize} · supply gap {WEIGHTS.supplyGap} ·
              capability {WEIGHTS.originCapability} · tariff {WEIGHTS.tariffAdvantage} ·
              sector weight {WEIGHTS.marketMomentum}
            </span>
            {!sector && (
              <span>
                Capped at two cards per destination country so one large importer cannot
                fill the grid.
              </span>
            )}
          </div>

          {/*
            The legend is built from the FIRST result's own components rather than from
            WEIGHTS, so the key above the grid and the bands drawn inside it can never
            drift apart if a component is added, reordered or reweighted.
          */}
          <OpportunityBoard
            results={results}
            originIso={origin}
            originName={country.name}
            componentLegend={results[0].components.map((c) => ({ label: c.label, max: c.max }))}
          />

          {scan && results.length < Math.min(scan.total, MAX_CARDS) && (
            <div className="mt-4 flex justify-center">
              <Link
                href={`/opportunities?${moreParams.toString()}`}
                scroll={false}
                className="flex items-center gap-1.5 rounded-lg border border-hairline bg-surface px-4 py-2 text-sm font-medium text-ink-secondary transition-colors hover:bg-raised hover:text-ink"
              >
                <ChevronDown className="h-4 w-4" aria-hidden />
                Show more markets
              </Link>
            </div>
          )}
        </>
      )}

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        <div className="card p-4">
          <h2 className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-ink-muted">
            <Calculator className="h-3 w-3" aria-hidden />
            How a score is built
          </h2>
          <dl className="mt-3 space-y-2.5 text-xs leading-relaxed">
            <Row term={`Market size (${WEIGHTS.demandSize} pts)`}>
              How much of the sector the destination imports annually, log-scaled - a $40B
              market should not score forty times a $1B one. The scale is fixed, so
              changing the coverage filter never changes a score.
            </Row>
            <Row term={`Supply gap (${WEIGHTS.supplyGap} pts)`}>
              How little of that the origin currently supplies. Estimated from the
              origin&apos;s overall share of the destination&apos;s imports, since
              partner-by-product detail is not published at this tier.
            </Row>
            <Row term={`Origin capability (${WEIGHTS.originCapability} pts)`}>
              The origin&apos;s share of world exports in that sector. This guardrail stops
              the engine suggesting a country export something it has never made.
            </Row>
            <Row term={`Tariff position (${WEIGHTS.tariffAdvantage} pts)`}>
              The average applied rate the destination charges the origin. A missing rate
              scores neutral, never favorable - absent data is not evidence of a low tariff.
            </Row>
            <Row term={`Sector weight (${WEIGHTS.marketMomentum} pts)`}>
              How central the sector is to the destination&apos;s import basket.
            </Row>
          </dl>
        </div>

        <div className="card p-4">
          <h2 className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-ink-muted">
            <ShieldAlert className="h-3 w-3" aria-hidden />
            What this is not
          </h2>
          <div className="mt-3 space-y-3">
            <Warn>
              These are statistical signals derived from published trade aggregates. They
              are not investment, legal, or trade-compliance advice, and no card here
              accounts for freight cost, lead time, certification, distribution, local
              competition, or non-tariff barriers.
            </Warn>
            <p className="text-xs leading-relaxed text-ink-muted">
              Sector granularity is the HS-section group, not the HS-6 product line. A
              &quot;Chemicals&quot; opportunity covers thousands of distinct products with
              very different market dynamics. Treat a high score as a prompt to
              investigate a market, not as a conclusion about one.
            </p>
            <p className="text-xs leading-relaxed text-ink-muted">
              Widening market coverage brings smaller economies into range. It does not
              make them better prospects - a $30M market scores few size points however it
              is filtered, and small markets are where freight and distribution costs bite
              hardest.
            </p>
            <p className="text-xs leading-relaxed text-ink-muted">
              Supply-gap estimates are approximations, marked{" "}
              <span className="rounded border border-hairline px-1 py-px text-[9px] uppercase tracking-wide">
                est
              </span>{" "}
              wherever they appear.
            </p>
          </div>
        </div>
      </div>

      {/*
        A card is a prompt to investigate, and investigating means leaving this page: the
        destination's own profile, the corridor as it stands today, and what that
        destination charges. Those three checks are the difference between a score and a
        decision, and none of them was reachable from here.
      */}
      <RelatedViews
        links={relatedLinks}
        hint="Check a score against what the corridor already carries"
      />

      <div className="card mt-3 overflow-hidden">
        <ProvenanceBar meta={meta} extra={`origin ${origin} · ${year}`} />
      </div>
    </div>
  );
}

function Coverage({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="card px-4 py-3">
      <div className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-ink-muted">
        {icon}
        {label}
      </div>
      <div className="mt-1.5 text-2xl font-semibold leading-none">{value}</div>
      <div className="mt-1.5 text-xs text-ink-muted">{hint}</div>
    </div>
  );
}

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-medium text-ink-secondary">{term}</dt>
      <dd className="text-ink-muted">{children}</dd>
    </div>
  );
}
