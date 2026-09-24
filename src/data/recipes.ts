import type { ItemId } from "./items";
import type { NodeKind } from "./nodes";

/** Which kind of node may run a recipe. */
export type RecipeCategory = "smelting" | "assembly";

export interface Recipe {
  category: RecipeCategory;
  /** Items one batch consumes. */
  inputs: Readonly<Partial<Record<ItemId, number>>>;
  /** The item one batch makes, and how many. */
  output: ItemId;
  count: number;
  /** Time for one batch at speed 1.0. */
  seconds: number;
}

/** The red-era recipes (FR49), each named after what it makes. */
export const RECIPE_IDS = [
  "iron-plate",
  "copper-plate",
  "brick",
  "gear",
  "copper-cable",
  "circuit",
  "rail",
  "red-science",
] as const;

export type RecipeId = (typeof RECIPE_IDS)[number];

// Red-era recipes (FR49). Quantities and smelting times are Factorio 2.0.77
// placeholders (issue #4). Gear and circuit take the GDD's base times
// (FR50: 1 s each) over Factorio's 0.5 s. Rail keeps the GDD recipe, 1 iron
// plate + 1 stone → 2 rails, since Factorio's needs steel and iron sticks;
// its time is Factorio's 0.5 s.
export const RECIPES: Readonly<Record<RecipeId, Recipe>> = {
  "iron-plate": {
    category: "smelting",
    inputs: { "iron-ore": 1 },
    output: "iron-plate",
    count: 1,
    seconds: 3.2,
  },
  "copper-plate": {
    category: "smelting",
    inputs: { "copper-ore": 1 },
    output: "copper-plate",
    count: 1,
    seconds: 3.2,
  },
  brick: {
    category: "smelting",
    inputs: { stone: 2 },
    output: "brick",
    count: 1,
    seconds: 3.2,
  },
  gear: {
    category: "assembly",
    inputs: { "iron-plate": 2 },
    output: "gear",
    count: 1,
    seconds: 1,
  },
  "copper-cable": {
    category: "assembly",
    inputs: { "copper-plate": 1 },
    output: "copper-cable",
    count: 2,
    seconds: 0.5,
  },
  circuit: {
    category: "assembly",
    inputs: { "iron-plate": 1, "copper-cable": 3 },
    output: "circuit",
    count: 1,
    seconds: 1,
  },
  rail: {
    category: "assembly",
    inputs: { "iron-plate": 1, stone: 1 },
    output: "rail",
    count: 2,
    seconds: 0.5,
  },
  "red-science": {
    category: "assembly",
    inputs: { "copper-plate": 1, gear: 1 },
    output: "red-science",
    count: 1,
    seconds: 5,
  },
};

/** The node kinds that run recipes. */
export type CrafterKind = Extract<
  NodeKind,
  "furnace" | "assembler-1" | "assembler-2"
>;

/**
 * What each crafter runs, and its speed: it takes `seconds / speed` per batch
 * (FR31, FR34).
 */
export const CRAFTERS: Readonly<
  Record<CrafterKind, { category: RecipeCategory; speed: number }>
> = {
  furnace: { category: "smelting", speed: 1 },
  "assembler-1": { category: "assembly", speed: 0.5 },
  "assembler-2": { category: "assembly", speed: 0.75 },
};

export function isCrafterKind(kind: NodeKind): kind is CrafterKind {
  return kind in CRAFTERS;
}

/** An Extractor makes 1 item of its deposit's resource this often (FR30). */
export const EXTRACTOR_SECONDS = 2;
