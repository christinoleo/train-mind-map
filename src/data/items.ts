/** The raw resources that deposits hold (GDD §Mapa e recursos). */
export const RAW_RESOURCES = [
  "iron-ore",
  "copper-ore",
  "coal",
  "stone",
  "crude-oil",
] as const;

export type RawResource = (typeof RAW_RESOURCES)[number];
