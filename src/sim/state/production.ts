import type { ItemId } from "../../data/items";
import {
  CRAFTERS,
  EXTRACTOR_SECONDS,
  isCrafterKind,
  type Recipe,
  RECIPE_IDS,
  RECIPES,
  type RecipeId,
} from "../../data/recipes";
import { GENERATOR } from "../../data/power";
import { TICK_MS } from "../../config/constants";
import type { Emit } from "../events";
import type {
  CrafterNode,
  FactoryNode,
  NodeStatus,
  ProducerNode,
  Production,
} from "./gameState";

/** Empty buffers, no batch under way, waiting for its first tick. */
export function newProduction(): Production {
  return { status: "starved", input: {}, output: 0, progress: null };
}

export function isProducer(node: FactoryNode): node is ProducerNode {
  return "production" in node;
}

export function isCrafter(node: FactoryNode): node is CrafterNode {
  return isCrafterKind(node.kind);
}

function secondsToTicks(seconds: number): number {
  return Math.round((seconds * 1000) / TICK_MS);
}

/** One batch of what `node` makes: what it consumes, yields and takes. */
type Batch = Pick<Recipe, "inputs" | "output" | "count"> & { ticks: number };

function batchOf(node: ProducerNode): Batch | undefined {
  if (node.kind === "extractor") {
    return {
      inputs: {},
      output: node.resource,
      count: 1,
      ticks: secondsToTicks(EXTRACTOR_SECONDS),
    };
  }
  if (node.recipe === null) return undefined;
  const { inputs, output, count, seconds } = RECIPES[node.recipe];
  const ticks = secondsToTicks(seconds / CRAFTERS[node.kind].speed);
  return { inputs, output, count, ticks };
}

/**
 * Ticks one batch takes on `node`: the recipe's base time divided by the
 * node's speed (FR34).
 */
export function batchTicks(node: ProducerNode): number | undefined {
  return batchOf(node)?.ticks;
}

function isEmpty({ input, output, progress }: Production): boolean {
  return (
    output === 0 &&
    progress === null &&
    Object.values(input).every((n) => n === 0)
  );
}

/** The smelting recipe that consumes `item`, if any. */
function smeltingFor(item: ItemId): RecipeId | undefined {
  return RECIPE_IDS.find(
    (id) => RECIPES[id].category === "smelting" && RECIPES[id].inputs[item],
  );
}

/**
 * Hands `item` to `node`'s input buffers, from any input connector (FR25).
 * The item enters only when the active recipe consumes it and its buffer,
 * 2× what one batch needs, has room (FR24). An empty Furnace switches to the
 * smelting recipe of whatever arrives. A Generator takes its fuel (FR67).
 * Returns whether the item entered.
 */
export function acceptItem(node: FactoryNode, item: ItemId): boolean {
  if (node.kind === "generator") {
    if (item !== GENERATOR.fuel || node.fuel >= GENERATOR.buffer) return false;
    node.fuel++;
    return true;
  }
  if (!isCrafter(node)) return false;
  const p = node.production;
  let recipe = node.recipe;
  if (node.kind === "furnace" && isEmpty(p))
    recipe = smeltingFor(item) ?? recipe;
  if (recipe === null) return false;
  const need = RECIPES[recipe].inputs[item];
  const have = p.input[item] ?? 0;
  if (!need || have >= 2 * need) return false;
  node.recipe = recipe;
  p.input[item] = have + 1;
  return true;
}

/** Takes one finished item out of `node`'s output buffer, if there is one. */
export function takeOutput(node: FactoryNode): ItemId | undefined {
  if (!isProducer(node) || node.production.output === 0) return undefined;
  const item = batchOf(node)?.output;
  if (item !== undefined) node.production.output--;
  return item;
}

/** Consumes one batch's inputs, if all are in the buffers. */
function consume(p: Production, inputs: Batch["inputs"]): boolean {
  const needs = Object.entries(inputs) as [ItemId, number][];
  if (needs.some(([item, n]) => (p.input[item] ?? 0) < n)) return false;
  for (const [item, n] of needs) p.input[item]! -= n;
  return true;
}

/**
 * Works one tick on `p`, at `satisfaction` of full speed (FR64). A batch
 * starts once its inputs are in, and its output lands only when the output
 * buffer, 1 batch, has room (FR26).
 */
function advance(
  p: Production,
  batch: Batch | undefined,
  satisfaction: number,
): NodeStatus {
  if (!batch) return "starved";
  if (p.progress === null) {
    if (!consume(p, batch.inputs)) return "starved";
    p.progress = 0;
  }
  if (p.progress < batch.ticks) {
    if (satisfaction === 0) return "no_power";
    p.progress += satisfaction;
    if (p.progress < batch.ticks) return "working";
  }
  if (p.output > 0) return "blocked";
  p.output = batch.count;
  p.progress = null;
  return "working";
}

/**
 * Advances `node` by one tick at its mesh's `satisfaction` and reports a
 * change of status (FR23).
 */
export function stepProduction(
  node: ProducerNode,
  satisfaction: number,
  emit: Emit,
): void {
  const p = node.production;
  const status = advance(p, batchOf(node), satisfaction);
  if (status === p.status) return;
  p.status = status;
  emit({ type: "NodeStatusChanged", node: node.id, status });
}
