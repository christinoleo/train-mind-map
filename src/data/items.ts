/** The raw resources that deposits hold (GDD §Mapa e recursos). */
export const RAW_RESOURCES = [
  "iron-ore",
  "copper-ore",
  "coal",
  "stone",
  "crude-oil",
] as const;

export type RawResource = (typeof RAW_RESOURCES)[number];

/**
 * Every item the game knows so far: the raw resources plus the processed
 * items that construction costs name. The full list of about 31 items comes
 * with the recipes (Epic 3).
 */
export const ITEMS = [
  ...RAW_RESOURCES,
  "iron-plate",
  "copper-plate",
  "brick",
  "gear",
] as const;

export type ItemId = (typeof ITEMS)[number];
