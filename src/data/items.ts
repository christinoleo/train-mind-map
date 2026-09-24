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
 * Every item the game knows so far: the raw resources plus the products of
 * the red-era recipes (FR49). Later eras add the rest of the 31 items.
 */
export const ITEMS = [
  ...RAW_RESOURCES,
  "iron-plate",
  "copper-plate",
  "brick",
  "gear",
  "copper-cable",
  "circuit",
  "rail",
  "red-science",
] as const;

export type ItemId = (typeof ITEMS)[number];
