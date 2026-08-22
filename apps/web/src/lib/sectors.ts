/**
 * The WITS product-group catalog.
 *
 * These are HS-section aggregates, not HS-6 lines. That is a deliberate V1 trade-off:
 * section groups are stable across HS revisions H0-H6, which sidesteps the concordance
 * problem entirely. The cost is no HS-6 drill-down - that requires UN Comtrade and is
 * tracked as a V2 data decision (docs/PRD.md §10).
 *
 * Safe to import from client components: static, no data access.
 */

export const SECTOR_CATALOG = [
  { code: "84-85_MachElec", name: "Machinery & electronics" },
  { code: "27-27_Fuels", name: "Fuels" },
  { code: "28-38_Chemicals", name: "Chemicals" },
  { code: "72-83_Metals", name: "Metals" },
  { code: "86-89_Transport", name: "Transport" },
  { code: "50-63_TextCloth", name: "Textiles & clothing" },
  { code: "01-05_Animal", name: "Animal products" },
  { code: "06-15_Vegetable", name: "Vegetable products" },
  { code: "16-24_FoodProd", name: "Food products" },
  { code: "25-26_Minerals", name: "Minerals" },
  { code: "39-40_PlastiRub", name: "Plastics & rubber" },
  { code: "41-43_HidesSkin", name: "Hides & skins" },
  { code: "44-49_Wood", name: "Wood products" },
  { code: "64-67_Footwear", name: "Footwear" },
  { code: "68-71_StoneGlas", name: "Stone & glass" },
  { code: "90-99_Miscellan", name: "Miscellaneous" },
] as const;

const NAME_BY_CODE = new Map<string, string>(SECTOR_CATALOG.map((s) => [s.code, s.name]));

export function sectorName(code: string): string {
  return NAME_BY_CODE.get(code) ?? code;
}
