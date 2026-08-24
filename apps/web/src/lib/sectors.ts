/**
 * The WITS product-group catalog.
 *
 * These are HS-section aggregates, not HS-6 lines. That is a deliberate V1 trade-off:
 * section groups are stable across HS revisions H0-H6, which sidesteps the concordance
 * problem entirely. The cost is no HS-6 drill-down - that requires UN Comtrade and is
 * tracked as a V2 data decision (docs/PRD.md §10).
 *
 * `hs` and `covers` are HS NOMENCLATURE, not trade data. They carry no figures and are
 * not derived from any dataset; they name which chapters of the Harmonized System a group
 * spans and what sits inside those chapters. They exist because the group names alone
 * mislead. "Stone & glass" is the group that contains gold, diamonds and jewellery, so a
 * reader looking at Switzerland's second-largest export sees a label suggesting
 * tableware. "Vegetable products" contains coffee, cereals and palm oil. Without the
 * contents a reader cannot tell what a number is about, and a number nobody can interpret
 * is not information.
 *
 * `covers` is a representative list, never an exhaustive one, and the UI says so. It must
 * never be written as if it enumerated a chapter.
 *
 * Safe to import from client components: static, no data access.
 */

export const SECTOR_CATALOG = [
  {
    code: "84-85_MachElec",
    name: "Machinery & electronics",
    hs: "84-85",
    covers: "Engines, pumps, machine tools, computers, phones, semiconductors, wiring",
  },
  {
    code: "27-27_Fuels",
    name: "Fuels",
    hs: "27",
    covers: "Crude oil, refined petroleum, natural gas, coal, electricity",
  },
  {
    code: "28-38_Chemicals",
    name: "Chemicals",
    hs: "28-38",
    covers: "Pharmaceuticals, organic and inorganic chemicals, fertilisers, dyes, cosmetics, soaps",
  },
  {
    code: "72-83_Metals",
    name: "Metals",
    hs: "72-83",
    covers: "Iron and steel, copper, aluminium, nickel, tools, fasteners, metal articles",
  },
  {
    code: "86-89_Transport",
    name: "Transport",
    hs: "86-89",
    covers: "Cars and vehicle parts, railway stock, aircraft, ships and boats",
  },
  {
    code: "50-63_TextCloth",
    name: "Textiles & clothing",
    hs: "50-63",
    covers: "Cotton, silk, wool, man-made fibres, fabrics, knitted and woven apparel, home textiles",
  },
  {
    code: "01-05_Animal",
    name: "Animal products",
    hs: "01-05",
    covers: "Live animals, meat, fish and seafood, dairy, eggs, honey",
  },
  {
    code: "06-15_Vegetable",
    name: "Vegetable products",
    hs: "06-15",
    covers: "Coffee, tea, spices, cereals, fruit, vegetables, oilseeds, vegetable oils",
  },
  {
    code: "16-24_FoodProd",
    name: "Food products",
    hs: "16-24",
    covers: "Prepared meat and fish, sugar, cocoa, confectionery, beverages, spirits, tobacco",
  },
  {
    code: "25-26_Minerals",
    name: "Minerals",
    hs: "25-26",
    covers: "Iron ore, copper ore and other ores, salt, sulphur, stone, cement",
  },
  {
    code: "39-40_PlastiRub",
    name: "Plastics & rubber",
    hs: "39-40",
    covers: "Polymers, plastic articles, tyres, rubber goods",
  },
  {
    code: "41-43_HidesSkin",
    name: "Hides & skins",
    hs: "41-43",
    covers: "Raw hides, leather, handbags and saddlery, furskins",
  },
  {
    code: "44-49_Wood",
    name: "Wood products",
    hs: "44-49",
    covers: "Timber, plywood, cork, wood pulp, paper and paperboard, printed books",
  },
  {
    code: "64-67_Footwear",
    name: "Footwear",
    hs: "64-67",
    covers: "Shoes and boots, headgear, umbrellas, prepared feathers, artificial flowers",
  },
  {
    code: "68-71_StoneGlas",
    name: "Stone & glass",
    hs: "68-71",
    covers: "Gold, diamonds and precious stones, jewellery, ceramics, glassware, cement articles",
  },
  {
    code: "90-99_Miscellan",
    name: "Miscellaneous",
    hs: "90-99",
    covers:
      "Optical and medical instruments, watches, musical instruments, arms, furniture, toys, art",
  },
] as const;

export interface SectorInfo {
  code: string;
  name: string;
  /** Harmonized System chapters this group spans, e.g. "84-85". */
  hs: string;
  /** Representative contents, never exhaustive. */
  covers: string;
}

const BY_CODE = new Map<string, SectorInfo>(SECTOR_CATALOG.map((s) => [s.code, { ...s }]));

export function sectorName(code: string): string {
  return BY_CODE.get(code)?.name ?? code;
}

/**
 * The full record for a group, or null for a code that is not one of the sixteen.
 *
 * Null rather than a fabricated fallback: a `product/all` response mixes three
 * overlapping classification schemes, and a lookup-with-fallback here would silently
 * dress an UNCTAD stage-of-processing aggregate up as an HS section group. The whitelist
 * is the point (see CLAUDE.md, "A `product/all` response mixes three schemes").
 */
export function sectorInfo(code: string): SectorInfo | null {
  return BY_CODE.get(code) ?? null;
}

/** "Machinery & electronics (HS 84-85)", for a label that has room for the chapters. */
export function sectorLabel(code: string): string {
  const info = BY_CODE.get(code);
  return info ? `${info.name} (HS ${info.hs})` : code;
}
