"use client";

import {
  Anvil,
  Beef,
  Briefcase,
  Car,
  Cpu,
  Disc3,
  FlaskConical,
  Footprints,
  Fuel,
  Gem,
  Package,
  Pickaxe,
  Shapes,
  Shirt,
  TreePine,
  UtensilsCrossed,
  Wheat,
  type LucideIcon,
} from "lucide-react";
import { sectorColor } from "@/lib/palette";
import { useTheme } from "@/components/theme";

/**
 * A glyph per sector group - identity, not decoration.
 *
 * `sectorColor` maps the sixteen WITS groups onto EIGHT categorical hues plus a shared
 * grey "Other", because inventing a ninth hue is the one thing a categorical palette must
 * never do. The consequence is that half the catalog - plastics, hides, wood, footwear,
 * stone & glass, minerals, food, miscellaneous - all wear the same grey and are
 * indistinguishable by colour. The icon is the second channel that tells them apart, which
 * is exactly the composite encoding the palette rules call for once a set outgrows its
 * hues.
 *
 * So these are load-bearing, and two rules follow. An icon NEVER appears without its
 * label beside it, and it is always `aria-hidden` - a reader who cannot see it loses
 * nothing. And the mapping is keyed on the sector code and fixed for the life of the app,
 * for the same reason the hues are: a reader learns it once.
 *
 * The choices lean on what the chapters actually contain rather than on the group's name.
 * "Stone & glass" gets a gem because HS 68-71 is where gold, diamonds and jewellery are
 * counted, and that is what the number is mostly made of - a vase would be a prettier
 * icon and a worse one.
 */
const SECTOR_ICON: Record<string, LucideIcon> = {
  "84-85_MachElec": Cpu,
  "27-27_Fuels": Fuel,
  "28-38_Chemicals": FlaskConical,
  "72-83_Metals": Anvil,
  "86-89_Transport": Car,
  "50-63_TextCloth": Shirt,
  "01-05_Animal": Beef,
  "06-15_Vegetable": Wheat,
  "16-24_FoodProd": UtensilsCrossed,
  "25-26_Minerals": Pickaxe,
  "39-40_PlastiRub": Disc3,
  "41-43_HidesSkin": Briefcase,
  "44-49_Wood": TreePine,
  "64-67_Footwear": Footprints,
  "68-71_StoneGlas": Gem,
  "90-99_Miscellan": Shapes,
};

/**
 * The icon for a code, falling back to a generic parcel.
 *
 * A fallback is safe here in a way `sectorInfo` is not: getting a glyph wrong costs
 * nothing, whereas a lookup-with-fallback on the CATALOG would dress an UNCTAD
 * stage-of-processing aggregate up as an HS section group.
 */
export function sectorIconFor(code: string): LucideIcon {
  return SECTOR_ICON[code] ?? Package;
}

export function SectorIcon({
  code,
  className = "h-3.5 w-3.5",
  /** Paint it in the sector's own hue, so colour and shape agree. */
  colored = true,
}: {
  code: string;
  className?: string;
  colored?: boolean;
}) {
  const { resolved } = useTheme();
  const Icon = sectorIconFor(code);

  return (
    <Icon
      className={`shrink-0 ${className}`}
      style={colored ? { color: sectorColor(code, resolved) } : undefined}
      // Always decorative: the sector is named in text beside every one of these.
      aria-hidden
    />
  );
}
