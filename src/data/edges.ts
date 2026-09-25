import type { Cost } from "./nodes";

/** The edge levels, 1 to 3 (GDD §Arestas). */
export const EDGE_LEVELS = [1, 2, 3] as const;

export type EdgeLevel = (typeof EDGE_LEVELS)[number];

/** Longest edge at every level, in cells (GDD §Arestas, FR54). */
export const EDGE_MAX_LENGTH = 200;

/**
 * Every this many cells of length, an edge's cost per cell doubles and its
 * throughput halves (GDD §Arestas, FR54).
 */
export const EDGE_DISTANCE_STEP = 12;

/**
 * What one cell of edge costs at each level, 1 to 3 (GDD §Custos, FR44):
 * each level adds an item to the one below.
 */
export const EDGE_CELL_COST: readonly Cost[] = [
  { "iron-ore": 1 },
  { "iron-ore": 1, gear: 1 },
  { "iron-ore": 1, gear: 1, circuit: 1 },
];

/** The level a new edge starts at; upgrades raise it in place (FR58). */
export const NEW_EDGE_LEVEL: EdgeLevel = 1;

/** Items per second an edge carries at each level, 1 to 3 (GDD §Arestas, FR55). */
export const EDGE_THROUGHPUT = [2, 4, 8] as const;

/** Speed of items along an edge, in cells per second (FR55). */
export const ITEM_SPEED = 3;
