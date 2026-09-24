import type { CellBlock, Scenario } from "./scenario";

/** The rail corridor through the water wall: 1 cell wide, 20 cells long. */
export const MVP_CORRIDOR: CellBlock = { x: 76, y: 60, w: 20, h: 1 };

/** Water in columns 76–95 over the whole revealed height (rows 12–107). */
export const MVP_WATER_WALL: CellBlock = { x: 76, y: 12, w: 20, h: 96 };

/**
 * The MVP map (GDD v1.6 §Mapa do MVP, decided in issue #6). The starter
 * resources sit around the Core, and the big copper deposit sits behind a
 * corridor that no node fits in and no edge spans, so only rail reaches it.
 */
export const MVP_SCENARIO: Scenario = {
  seed: "mvp-1",
  // 96² revealed from the start; the MVP has no expansion research.
  revealedRing: 2,
  // Centred on cell (60, 60).
  core: { x: 59, y: 59, w: 3, h: 3 },
  deposits: [
    // About 7 cells east of the Core.
    { resource: "iron-ore", x: 65, y: 58, w: 5, h: 5 },
    // About 7 cells west.
    { resource: "stone", x: 51, y: 59, w: 4, h: 4 },
    // About 8 cells south.
    { resource: "coal", x: 59, y: 66, w: 4, h: 4 },
    // Small copper, one Extractor slot, about 10 cells north.
    { resource: "copper-ore", x: 59, y: 49, w: 3, h: 3 },
    // Big copper behind the corridor, about 43 cells east.
    { resource: "copper-ore", x: 100, y: 57, w: 6, h: 6 },
  ],
  water: [MVP_WATER_WALL],
  land: [
    // The base area, west of the wall.
    { x: 44, y: 44, w: 32, h: 32 },
    MVP_CORRIDOR,
    // The rail route's east end and the big copper deposit.
    { x: 96, y: 52, w: 12, h: 16 },
  ],
};
