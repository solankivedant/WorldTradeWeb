/**
 * The opportunity engine.
 *
 * Rule-based and fully explainable, by design. V1 explicitly rules out ML scoring
 * (docs/DESIGN.md §10) because a card a user cannot audit is an unverifiable
 * assertion, and this product's only asset is trust in its numbers.
 *
 * Every score returns its own arithmetic: each component carries its points and a
 * plain-English reason, and the UI renders the breakdown next to the total. If a user
 * disagrees with a score, they can see exactly which input they disagree with.
 *
 * Weights live in WEIGHTS below rather than being inlined, so tuning is a config
 * change. Points are on a 0-100 scale.
 */

import "server-only";
import {
  allCountries,
  bilateralValue,
  getCountry,
  productsFor,
  tariffApplied,
} from "./data";
import type { Opportunity, ScoreComponent } from "./types";

export const WEIGHTS = {
  /** How big is the destination's appetite for this sector? */
  demandSize: 30,
  /** How much of that appetite is the origin NOT currently supplying? */
  supplyGap: 28,
  /** Can the origin actually make this? Guards against nonsense suggestions. */
  originCapability: 22,
  /** Does the origin face a favorable tariff into this market? */
  tariffAdvantage: 12,
  /** Is the destination's own trade growing? */
  marketMomentum: 8,
} as const;

/** Guardrails. Below these the signal is noise and the card is not emitted. */
export const GUARDRAILS = {
  /** Destination must import at least this much of the sector, USD. */
  minDestinationImports: 25_000_000,
  /** Origin must already export at least this much of the sector, USD. Prevents
   *  suggesting a country export something it has never made. */
  minOriginCapability: 50_000_000,
  /** Above this existing share the market is already served by the origin. */
  maxExistingShare: 40,
} as const;

/**
 * How far down the size range to look, as a reader-facing control.
 *
 * The floor used to be hard-wired at $200M per sector, which is a filter on the WORLD,
 * not on the ranking: an economy the size of Rwanda or Fiji imports less than that in
 * every sector it has, so those countries could never appear on this page no matter how
 * good a fit they were. Whether a $60M market is worth an SMB's attention is the
 * reader's call, not the engine's, so the floor is now a control with a broad default.
 */
export const MARKET_FLOORS = [
  { id: "all", label: "Every reported market", min: 2_000_000 },
  { id: "broad", label: "Markets above $25M", min: 25_000_000 },
  { id: "mid", label: "Markets above $200M", min: 200_000_000 },
  { id: "major", label: "Markets above $1B", min: 1_000_000_000 },
] as const;

export type MarketFloorId = (typeof MARKET_FLOORS)[number]["id"];

export function marketFloor(id: string | undefined): (typeof MARKET_FLOORS)[number] {
  return MARKET_FLOORS.find((f) => f.id === id) ?? MARKET_FLOORS[1];
}

function logScore(value: number, floor: number, ceiling: number): number {
  if (value <= floor) return 0;
  const t = Math.log10(value / floor) / Math.log10(ceiling / floor);
  return Math.max(0, Math.min(1, t));
}

/**
 * Demand points are scored against a FIXED size range, never against the reader's
 * chosen floor.
 *
 * Anchoring the log scale at the filter would make the same market score differently
 * depending on which coverage setting happened to be selected - a $400M market worth 14
 * points under one filter and 22 under another. A score whose meaning moves with an
 * unrelated control is exactly the kind of unauditable number this engine exists to
 * avoid.
 */
const DEMAND_SCALE = { floor: 10_000_000, ceiling: 5e11 } as const;

export interface OpportunityQuery {
  origin: string;
  sector?: string;
  minMarket?: number;
  limit?: number;
  /** Max cards per sector when browsing all sectors. See diversify() below. */
  perSector?: number;
  /** Max cards per destination country when browsing all sectors. */
  perDestination?: number;
}

export interface OpportunityScan {
  /** The slice actually rendered - diversified across sectors and destinations. */
  items: Opportunity[];
  /** Everything that cleared the guardrails, before diversification and the limit. */
  total: number;
  /** Distinct destination countries among those results. */
  destinations: number;
  /** Distinct sectors among those results. */
  sectors: number;
  /** Destinations that report imports at all, i.e. the size of the field considered. */
  destinationsConsidered: number;
  /** The size floor the scan actually ran with, USD. */
  minMarket: number;
}

/**
 * Spread results across sectors AND destinations instead of returning one sector, or one
 * country, repeated.
 *
 * Raw score ranking is dominated by whatever the origin's largest export sector is: for
 * India, "Fuels" took 8 of the top 12 cards, each saying the same thing about a different
 * large economy. Capping per sector fixed that but left the mirror-image problem - the
 * same handful of big importers (USA, China, Germany) occupying most of the grid across
 * different sectors, so a page of 36 cards showed barely a dozen countries. Two caps are
 * therefore needed, not one, and they are applied together in a single round-robin so
 * neither can starve the other.
 *
 * When the reader filters to ONE sector they have asked for depth, so both caps lift and
 * the full ranked list comes back.
 */
function diversify(
  sorted: Opportunity[],
  perSector: number,
  perDestination: number,
  limit: number,
): Opportunity[] {
  const bySector = new Map<string, Opportunity[]>();
  for (const item of sorted) {
    const list = bySector.get(item.sector);
    if (list) list.push(item);
    else bySector.set(item.sector, [item]);
  }
  // Sectors ordered by their single best opportunity, so the strongest idea still leads.
  const queues = [...bySector.values()].sort((a, b) => b[0].score - a[0].score);
  const cursors = new Array<number>(queues.length).fill(0);
  const takenPerSector = new Array<number>(queues.length).fill(0);
  const takenPerDestination = new Map<string, number>();

  const out: Opportunity[] = [];
  let advanced = true;
  while (out.length < limit && advanced) {
    advanced = false;
    for (let i = 0; i < queues.length && out.length < limit; i++) {
      if (takenPerSector[i] >= perSector) continue;
      const queue = queues[i];
      while (cursors[i] < queue.length) {
        const candidate = queue[cursors[i]++];
        const used = takenPerDestination.get(candidate.destination) ?? 0;
        if (used >= perDestination) continue;
        takenPerDestination.set(candidate.destination, used + 1);
        takenPerSector[i] += 1;
        out.push(candidate);
        advanced = true;
        break;
      }
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

const EMPTY_SCAN: OpportunityScan = {
  items: [],
  total: 0,
  destinations: 0,
  sectors: 0,
  destinationsConsidered: 0,
  minMarket: GUARDRAILS.minDestinationImports,
};

export function findOpportunities(query: OpportunityQuery): OpportunityScan {
  const origin = getCountry(query.origin);
  if (!origin) return EMPTY_SCAN;

  const originProducts = productsFor(origin.iso3, "x");
  if (!originProducts.length) return EMPTY_SCAN;

  const originTotal = originProducts.reduce((sum, p) => sum + p.value, 0);
  const originBySector = new Map(originProducts.map((p) => [p.code, p]));

  // World export totals per sector, used to judge whether the origin is actually
  // competitive in a sector rather than merely present in it.
  const worldBySector = new Map<string, number>();
  for (const country of allCountries()) {
    for (const p of productsFor(country.iso3, "x")) {
      worldBySector.set(p.code, (worldBySector.get(p.code) ?? 0) + p.value);
    }
  }

  const minMarket = query.minMarket ?? GUARDRAILS.minDestinationImports;
  const results: Opportunity[] = [];
  let destinationsConsidered = 0;

  for (const destination of allCountries()) {
    if (destination.iso3 === origin.iso3) continue;

    const destImports = productsFor(destination.iso3, "m");
    if (!destImports.length) continue;
    destinationsConsidered += 1;

    const destTotalImports = destImports.reduce((sum, p) => sum + p.value, 0);
    // Existing bilateral relationship, from the origin's own export report.
    const existingBilateral = bilateralValue(origin.iso3, destination.iso3, "x");
    const tariff = tariffApplied(destination.iso3, origin.iso3);

    for (const destSector of destImports) {
      if (query.sector && destSector.code !== query.sector) continue;
      if (destSector.value < minMarket) continue;

      const originSector = originBySector.get(destSector.code);
      if (!originSector || originSector.value < GUARDRAILS.minOriginCapability) continue;

      // Approximate the origin's current sector-level presence in this destination
      // by applying its overall bilateral share to the sector. WITS does not publish
      // partner-by-product at this tier, so this is an estimate and is labeled as one
      // in the UI rather than presented as a measured figure.
      const overallShare =
        existingBilateral !== null && destTotalImports > 0
          ? existingBilateral / destTotalImports
          : 0;
      const estimatedPresence = overallShare * destSector.value;
      const currentSharePct = (estimatedPresence / destSector.value) * 100;
      if (currentSharePct > GUARDRAILS.maxExistingShare) continue;

      const worldSector = worldBySector.get(destSector.code) ?? 0;
      const originWorldShare = worldSector > 0 ? (originSector.value / worldSector) * 100 : 0;

      const components: ScoreComponent[] = [];

      // 1. Demand size - how large is the prize.
      const demandT = logScore(destSector.value, DEMAND_SCALE.floor, DEMAND_SCALE.ceiling);
      const demandPts = demandT * WEIGHTS.demandSize;
      components.push({
        label: "Market size",
        points: Math.round(demandPts),
        max: WEIGHTS.demandSize,
        reason: `${destination.name} imports $${(destSector.value / 1e9).toFixed(1)}B of ${destSector.name} a year.`,
      });

      // 2. Supply gap - the headroom.
      const gapT = 1 - Math.min(1, currentSharePct / GUARDRAILS.maxExistingShare);
      const gapPts = gapT * WEIGHTS.supplyGap;
      components.push({
        label: "Supply gap",
        points: Math.round(gapPts),
        max: WEIGHTS.supplyGap,
        reason:
          currentSharePct < 0.5
            ? `${origin.name} currently supplies almost none of it.`
            : `${origin.name} supplies an estimated ${currentSharePct.toFixed(1)}% today.`,
      });

      // 3. Origin capability - can they actually make it.
      const capT = Math.min(1, originWorldShare / 15);
      const capPts = capT * WEIGHTS.originCapability;
      components.push({
        label: "Origin capability",
        points: Math.round(capPts),
        max: WEIGHTS.originCapability,
        reason: `${origin.name} holds ${originWorldShare.toFixed(1)}% of world ${destSector.name} exports ($${(originSector.value / 1e9).toFixed(1)}B).`,
      });

      // 4. Tariff advantage. A missing rate scores neutral, never favorable -
      // absence of data is not evidence of a low tariff.
      let tariffPts = WEIGHTS.tariffAdvantage * 0.4;
      let tariffReason = "No tariff rate published for this pair; scored neutral.";
      if (tariff !== null) {
        const tariffT = Math.max(0, 1 - tariff / 20);
        tariffPts = tariffT * WEIGHTS.tariffAdvantage;
        tariffReason =
          tariff < 1
            ? `${destination.name} applies effectively no tariff to ${origin.name} (${tariff.toFixed(1)}%).`
            : `${destination.name} applies an average ${tariff.toFixed(1)}% tariff to ${origin.name}.`;
      }
      components.push({
        label: "Tariff position",
        points: Math.round(tariffPts),
        max: WEIGHTS.tariffAdvantage,
        reason: tariffReason,
      });

      // 5. Market momentum - sector weight within the destination's import basket.
      const momentumT = Math.min(1, destSector.value / destTotalImports / 0.15);
      const momentumPts = momentumT * WEIGHTS.marketMomentum;
      components.push({
        label: "Sector weight",
        points: Math.round(momentumPts),
        max: WEIGHTS.marketMomentum,
        reason: `${destSector.name} is ${((destSector.value / destTotalImports) * 100).toFixed(1)}% of ${destination.name}'s imports.`,
      });

      const score = Math.round(demandPts + gapPts + capPts + tariffPts + momentumPts);
      if (score < 25) continue;

      results.push({
        origin: origin.iso3,
        originName: origin.name,
        destination: destination.iso3,
        destinationName: destination.name,
        destinationIso2: destination.iso2,
        destinationRegion: destination.region?.trim() ?? null,
        sector: destSector.code,
        sectorName: destSector.name,
        score,
        components,
        evidence: {
          destinationImports: destSector.value,
          originSectorExports: originSector.value,
          currentBilateral: existingBilateral,
          currentShare: currentSharePct,
          originWorldShare,
          tariff,
          destinationGrowth: null,
        },
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  const limit = query.limit ?? 60;
  const summary = {
    total: results.length,
    destinations: new Set(results.map((r) => r.destination)).size,
    sectors: new Set(results.map((r) => r.sector)).size,
    destinationsConsidered,
    minMarket,
  };

  // A sector filter is a request for depth in that sector; no cap applies.
  if (query.sector) return { ...summary, items: results.slice(0, limit) };

  // Enough rounds per sector to actually fill the requested limit - a fixed 3 silently
  // capped the page at 48 cards however many were asked for.
  const perSector = query.perSector ?? Math.max(4, Math.ceil(limit / 8));
  const perDestination = query.perDestination ?? 2;
  return { ...summary, items: diversify(results, perSector, perDestination, limit) };
}

/** Sectors the origin actually exports, for the filter dropdown. */
export function sectorsForOrigin(iso3: string): { code: string; name: string }[] {
  return productsFor(iso3, "x")
    .filter((p) => p.value >= GUARDRAILS.minOriginCapability)
    .map((p) => ({ code: p.code, name: p.name }));
}
