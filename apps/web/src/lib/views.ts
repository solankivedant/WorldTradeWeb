import {
  Compass,
  Database,
  Globe2,
  Layers,
  Lightbulb,
  Map as MapIcon,
  Percent,
  Route,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * The product's map of itself.
 *
 * Eight routes cut the SAME cube eight ways, and until this file existed nothing on any
 * screen said so. A reader who landed on a sector page had no way to tell it was the
 * corridor page's figures rotated ninety degrees, so the app read as eight unrelated
 * tools that happened to share a header.
 *
 * One definition per view, and the load-bearing field is `question`, not `label`.
 * "Corridor" tells a reader nothing about whether to click; "what do these two countries
 * actually sell each other" tells them immediately. `RelatedViews`, the map's orientation
 * panel and the source page's diagram all render from here, so a link's promise cannot
 * drift away from the page that has to keep it.
 *
 * Safe to import from client components: static strings and icon references, no data
 * access.
 */
export interface ViewDef {
  id: ViewId;
  label: string;
  Icon: LucideIcon;
  /** The unit of analysis - what exactly ONE screen of this view is about. */
  grain: string;
  /** The question it answers, phrased the way a reader would ask it out loud. */
  question: string;
}

export type ViewId =
  | "map"
  | "explore"
  | "country"
  | "corridor"
  | "sector"
  | "tariffs"
  | "opportunities"
  | "source";

export const VIEWS: Record<ViewId, ViewDef> = {
  map: {
    id: "map",
    label: "Map",
    Icon: MapIcon,
    grain: "the whole world, one year at a time",
    question: "who trades most, and where does one country's trade actually go?",
  },
  explore: {
    id: "explore",
    label: "Explore",
    Icon: Compass,
    grain: "every sector and every connection at once",
    question: "what does the world trade, and which routes carry it?",
  },
  country: {
    id: "country",
    label: "Country",
    Icon: Globe2,
    grain: "one economy",
    question: "what does this country sell, what does it buy, and from whom?",
  },
  corridor: {
    id: "corridor",
    label: "Connection",
    Icon: Route,
    grain: "one pair of countries, both directions",
    question: "what do these two actually sell each other, and which way does it lean?",
  },
  sector: {
    id: "sector",
    label: "Sector",
    Icon: Layers,
    grain: "one HS section group, worldwide",
    question: "who sells this kind of goods, who buys it, and how few suppliers dominate?",
  },
  tariffs: {
    id: "tariffs",
    label: "Tariffs",
    Icon: Percent,
    grain: "one country's schedule against every partner",
    question: "what does it cost to bring goods across this border?",
  },
  opportunities: {
    id: "opportunities",
    label: "Opportunities",
    Icon: Lightbulb,
    grain: "one exporting country, scored against every market",
    question: "where is demand large, supply thin, and this country already capable?",
  },
  source: {
    id: "source",
    label: "Source",
    Icon: Database,
    grain: "the build itself",
    question: "where did every figure on every other page come from?",
  },
};

/** One outbound link, carrying the promise the destination has to keep. */
export interface RelatedLink {
  href: string;
  /** What the reader will be looking at, named concretely. */
  label: string;
  /** Why they would go - the question that page answers about THIS subject. */
  question: string;
  view: ViewId;
}

/*
 * Builders rather than inline template strings at each call site. The href shape and the
 * sentence describing it then change together, which is the failure the product page hit:
 * it linked rows at a corridor whose origin was arbitrary because the href was assembled
 * three files away from the words explaining it.
 */

export function toCountry(iso3: string, name: string): RelatedLink {
  return {
    href: `/country/${iso3}`,
    label: `${name} trade profile`,
    question: "Its whole position: sector mix, every partner, and thirteen years of it.",
    view: "country",
  };
}

export function toCorridor(a: string, b: string, aName: string, bName: string): RelatedLink {
  return {
    href: `/corridor/${a}/${b}`,
    label: `${aName} and ${bName}`,
    question: "Both directions side by side, with the mirror gap and the corridor's tariffs.",
    view: "corridor",
  };
}

export function toSector(code: string, name: string): RelatedLink {
  return {
    href: `/product/${encodeURIComponent(code)}`,
    label: `${name} worldwide`,
    question: "Every country selling and buying this group, and how concentrated supply is.",
    view: "sector",
  };
}

export function toTariffs(reporter: string, name: string, partner?: string): RelatedLink {
  const query = partner ? `?reporter=${reporter}&partner=${partner}` : `?reporter=${reporter}`;
  return {
    href: `/tariffs${query}`,
    label: `What ${name} charges`,
    question: "Its applied rate against every partner, banded and sortable.",
    view: "tariffs",
  };
}

export function toOpportunities(origin: string, name: string, sector?: string): RelatedLink {
  const query = sector
    ? `?origin=${origin}&sector=${encodeURIComponent(sector)}`
    : `?origin=${origin}`;
  return {
    href: `/opportunities${query}`,
    label: `Where ${name} could sell more`,
    question: "Large markets it barely supplies, scored with the arithmetic shown.",
    view: "opportunities",
  };
}

export function toExplore(query = "", subject?: string): RelatedLink {
  return {
    href: `/explore${query}`,
    label: subject ? `Every connection involving ${subject}` : "World trade explorer",
    question: subject
      ? "The full ranked corridor list, narrowable by sector, region and size."
      : "All sixteen sectors and every connection, with no country picked first.",
    view: "explore",
  };
}

export function toMap(query = ""): RelatedLink {
  return {
    href: `/${query}`,
    label: "Back to the map",
    question: "See the same figures as flows on the globe, year by year.",
    view: "map",
  };
}

export const TO_SOURCE: RelatedLink = {
  href: "/source",
  label: "Sources and method",
  question: "Which agency published what, when it was fetched, and what the build dropped.",
  view: "source",
};
