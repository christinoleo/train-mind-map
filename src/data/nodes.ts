import type { ItemCounts } from "./items";

/** Every node covers a square of this many cells per side (GDD §Nós, FR15). */
export const NODE_SIZE = { min: 2, max: 3 } as const;

/** The node kinds of the MVP (GDD §Nós). */
export const NODE_KINDS = [
  "core",
  "extractor",
  "furnace",
  "assembler-1",
  "assembler-2",
  "generator",
  "box",
  "splitter",
  "merger",
  "lab",
  "station",
] as const;

export type NodeKind = (typeof NODE_KINDS)[number];

/** The kinds whose contents make up the global stock (FR68). */
export type StorageKind = "core" | "box";

/**
 * How many items, of mixed types, each storage kind holds (GDD §Nós). The
 * Core holds without limit (GDD 1.14, FR28): a full Core once refused every
 * tap and edge and left the player stuck.
 */
export const STORAGE_CAPACITY: Readonly<Record<StorageKind, number>> = {
  core: Infinity,
  box: 500,
};

/** The category a node's header is coloured by (GDD §Arte). */
export type NodeCategory =
  | "core"
  | "extraction"
  | "smelting"
  | "assembly"
  | "power"
  | "storage"
  | "logistics"
  | "research"
  | "rail";

/**
 * When a kind becomes buildable: from the start, after research (Epic 4), or
 * never, for the Core, which the game places itself (FR18).
 */
export type Unlock = "start" | "research" | "never";

export type Cost = Readonly<ItemCounts>;

export interface NodeDef {
  /** Side of the square footprint, in cells. */
  size: 2 | 3;
  /** Input connectors, on the card's left side. */
  inputs: number;
  /** Output connectors, on the card's right side. */
  outputs: number;
  category: NodeCategory;
  /** Construction cost, drawn from the global stock (GDD §Custos). */
  cost: Cost;
  unlock: Unlock;
  /** The kind it is upgraded to in place, paying the difference (FR22). */
  upgrade?: NodeKind;
}

// Connector counts and costs come from the GDD tables (§Nós, §Custos de
// construção). The GDD gives footprints only as 2×2 to 3×3; the per-kind
// sizes here are first guesses: 3×3 for the multi-input hubs, 2×2 otherwise.
export const NODES: Readonly<Record<NodeKind, NodeDef>> = {
  core: {
    size: 3,
    inputs: 4,
    outputs: 2,
    category: "core",
    cost: {},
    unlock: "never",
  },
  extractor: {
    size: 2,
    inputs: 0,
    outputs: 1,
    category: "extraction",
    cost: { "iron-ore": 10, stone: 5 },
    unlock: "start",
  },
  furnace: {
    size: 2,
    inputs: 2,
    outputs: 1,
    category: "smelting",
    cost: { stone: 10 },
    unlock: "start",
  },
  "assembler-1": {
    size: 3,
    inputs: 3,
    outputs: 1,
    category: "assembly",
    cost: { "iron-plate": 20, "copper-plate": 10 },
    unlock: "start",
    upgrade: "assembler-2",
  },
  // Green era (GDD §Progressão). Its cost is a placeholder for the balancing
  // sheet; it holds all of the Montadora 1's, so an upgrade and a removal
  // refund the same total.
  "assembler-2": {
    size: 3,
    inputs: 3,
    outputs: 1,
    category: "assembly",
    cost: { "iron-plate": 40, "copper-plate": 10, gear: 10, circuit: 10 },
    unlock: "research",
  },
  generator: {
    size: 2,
    inputs: 1,
    outputs: 0,
    category: "power",
    cost: { stone: 10, "iron-ore": 10 },
    unlock: "start",
  },
  box: {
    size: 2,
    inputs: 2,
    outputs: 2,
    category: "storage",
    cost: { "iron-ore": 10 },
    unlock: "start",
  },
  splitter: {
    size: 2,
    inputs: 1,
    outputs: 3,
    category: "logistics",
    cost: { "iron-plate": 5, gear: 2 },
    unlock: "research",
  },
  merger: {
    size: 2,
    inputs: 3,
    outputs: 1,
    category: "logistics",
    cost: { "iron-plate": 5, gear: 2 },
    unlock: "research",
  },
  lab: {
    size: 3,
    inputs: 3,
    outputs: 0,
    category: "research",
    cost: { "iron-plate": 20, "copper-plate": 10, brick: 10 },
    unlock: "start",
  },
  // A regular card that also has rail ports (FR41); see `STATION` in rail.ts.
  station: {
    size: 2,
    inputs: 3,
    outputs: 3,
    category: "rail",
    cost: { "iron-plate": 20, brick: 10 },
    unlock: "research",
  },
};

/** The kinds buildable from the start, before any research. */
export const STARTING_NODES: readonly NodeKind[] = NODE_KINDS.filter(
  (kind) => NODES[kind].unlock === "start",
);
