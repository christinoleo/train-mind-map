import type { RawResource } from "./items";

export interface RingParams {
  /** Smallest and largest side of a deposit in this ring, in cells. */
  depositSize: readonly [min: number, max: number];
  /** How many deposits of each resource the ring holds. */
  deposits: Readonly<Partial<Record<RawResource, number>>>;
}

/**
 * Tuning for map generation. It is a parameter of the generator, so a fixed
 * seed or a test can override any of it.
 */
export interface MapGenParams {
  /** Side of the Core, in cells. It sits at the centre of the map. */
  coreSize: number;
  /** No water within this many cells of the Core. */
  coreClearance: number;
  /** Size of a lake noise feature, in cells. */
  lakeScale: number;
  lakeOctaves: number;
  /** A cell is water where the lake noise is above this value. */
  lakeThreshold: number;
  /** Fewest land cells between two deposits. */
  depositGap: number;
  /** One entry per ring, from ring 0 (the starting area) outwards. */
  rings: readonly RingParams[];
  /** Resources that must have a deposit within `starterDistance` of the Core. */
  starterResources: readonly RawResource[];
  starterDistance: number;
  /** Oil appears only from this ring outwards... */
  oilMinRing: number;
  /** ...and at least this many cells from the Core. */
  oilMinDistance: number;
  /** Random positions tried for one deposit before the attempt is dropped. */
  placementTries: number;
  /** Sub-seeds tried before generation gives up. */
  maxAttempts: number;
}

// Placeholder balance: deposit counts and lake shape are first guesses, to be
// tuned in playtests. Distances and sizes come from the GDD (FR5, FR7, FR8).
export const MAP_GEN: MapGenParams = {
  coreSize: 3,
  coreClearance: 4,
  lakeScale: 16,
  lakeOctaves: 3,
  lakeThreshold: 0.64,
  depositGap: 1,
  rings: [
    {
      depositSize: [3, 4],
      deposits: { "iron-ore": 2, "copper-ore": 1, coal: 1, stone: 1 },
    },
    {
      depositSize: [4, 5],
      deposits: { "iron-ore": 2, "copper-ore": 2, coal: 2, stone: 1 },
    },
    {
      depositSize: [5, 6],
      deposits: {
        "iron-ore": 2,
        "copper-ore": 2,
        coal: 1,
        stone: 1,
        "crude-oil": 2,
      },
    },
    {
      depositSize: [5, 6],
      deposits: {
        "iron-ore": 3,
        "copper-ore": 3,
        coal: 2,
        stone: 2,
        "crude-oil": 3,
      },
    },
  ],
  starterResources: ["iron-ore", "copper-ore", "coal", "stone"],
  starterDistance: 15,
  oilMinRing: 2,
  oilMinDistance: 40,
  placementTries: 300,
  maxAttempts: 20,
};
