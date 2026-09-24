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
import { LAB, SCIENCE_PACKS } from "../../data/research";
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

export function secondsToTicks(seconds: number): number {
  return Math.round((seconds * 1000) / TICK_MS);
}

/** One batch of what `node` makes: what it consumes, yields and takes. */
type Batch = Pick<Recipe, "inputs" | "output" | "count"> & { ticks: number };

function batchOf(node: ProducerNode): Batch | undefined {
  // A Lab makes nothing; the research system runs it.
  if (node.kind === "lab") return undefined;
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
 * smelting recipe of whatever arrives. A Generator takes its fuel (FR67),
 * and a Lab science packs (FR40). Returns whether the item entered.
 */
export function acceptItem(node: FactoryNode, item: ItemId): boolean {
  if (node.kind === "lab") {
    const { input } = node.production;
    const have = input[item] ?? 0;
    if (!SCIENCE_PACKS.includes(item) || have >= LAB.buffer) return false;
    input[item] = have + 1;
    return true;
  }
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

/** How far below a batch's ticks progress may fall and still count as done. */
const PROGRESS_EPSILON = 1e-9;

/** Consumes one batch's inputs, if all are in the buffers. */
function consume(p: Production, inputs: Batch["inputs"]): boolean {
  const needs = Object.entries(inputs) as [ItemId, number][];
  if (needs.some(([item, n]) => (p.input[item] ?? 0) < n)) return false;
  for (const [item, n] of needs) p.input[item]! -= n;
  return true;
}

/**
 * Works one tick on the batch under way in `p`, which takes `ticks` at full
 * speed, at `satisfaction` of full speed (FR64). Returns "done" once the
 * batch's ticks are complete; finishing it is the caller's.
 */
export function work(
  p: Production,
  ticks: number,
  satisfaction: number,
): "working" | "no_power" | "done" {
  if (p.progress === null || p.progress >= ticks - PROGRESS_EPSILON) {
    return "done";
  }
  if (satisfaction === 0) return "no_power";
  p.progress += satisfaction;
  // Sums of fractions such as 10/12 fall a hair short of the whole; the
  // tolerance keeps them from costing an extra tick per batch.
  return p.progress < ticks - PROGRESS_EPSILON ? "working" : "done";
}

/** Records `node`'s new status and reports it when it changed (FR23). */
export function setStatus(
  node: ProducerNode,
  status: NodeStatus,
  emit: Emit,
): void {
  const p = node.production;
  if (status === p.status) return;
  p.status = status;
  emit({ type: "NodeStatusChanged", node: node.id, status });
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
  const worked = work(p, batch.ticks, satisfaction);
  if (worked !== "done") return worked;
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
  setStatus(node, advance(node.production, batchOf(node), satisfaction), emit);
}
