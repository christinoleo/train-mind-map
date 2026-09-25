import {
  addCounts,
  itemEntries,
  type ItemCounts,
  type ItemId,
} from "../../data/items";
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
import { LAB, RESEARCH, SCIENCE_PACKS } from "../../data/research";
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
 * The recipe a crafter would run on `item` arriving after `pending`, the
 * items already on their way to it: an empty Furnace switches to the
 * smelting recipe of whatever reaches it first.
 */
function recipeOn(
  node: CrafterNode,
  item: ItemId,
  pending: Readonly<ItemCounts>,
): RecipeId | null {
  if (node.kind !== "furnace" || !isEmpty(node.production)) return node.recipe;
  const coming = itemEntries(pending).map(([first]) => first);
  const first = [...coming, item].map(smeltingFor).find(Boolean);
  return first ?? node.recipe;
}

/**
 * True when `node` takes `item` once `pending`, the items already on their
 * way to it, have entered: the active recipe consumes it and its buffer,
 * 2× what one batch needs, has room (FR24). A Generator takes its fuel
 * (FR67), and a Lab science packs (FR40).
 */
export function wouldAccept(
  node: FactoryNode,
  item: ItemId,
  pending: Readonly<ItemCounts> = {},
): boolean {
  const coming = pending[item] ?? 0;
  if (node.kind === "lab") {
    const have = node.production.input[item] ?? 0;
    return SCIENCE_PACKS.includes(item) && have + coming < LAB.buffer;
  }
  if (node.kind === "generator") {
    return item === GENERATOR.fuel && node.fuel + coming < GENERATOR.buffer;
  }
  if (!isCrafter(node)) return false;
  const recipe = recipeOn(node, item, pending);
  if (recipe === null) return false;
  const need = RECIPES[recipe].inputs[item];
  const have = node.production.input[item] ?? 0;
  return need !== undefined && have + coming < 2 * need;
}

/**
 * Hands `item` to `node`'s input buffers, from any input connector (FR25),
 * when `wouldAccept` says it takes it. An empty Furnace switches to the
 * smelting recipe of whatever arrives. Returns whether the item entered.
 */
export function acceptItem(node: FactoryNode, item: ItemId): boolean {
  if (!wouldAccept(node, item)) return false;
  if (node.kind === "generator") {
    node.fuel++;
    return true;
  }
  if (!isProducer(node)) return false;
  if (isCrafter(node)) node.recipe = recipeOn(node, item, {});
  const { input } = node.production;
  input[item] = (input[item] ?? 0) + 1;
  return true;
}

/**
 * The items `node` holds in its buffers, for when it is removed: its inputs,
 * its finished output and the inputs of the batch under way. A Generator's
 * fuel counts; the item burning now does not.
 */
export function bufferedItems(node: FactoryNode): ItemCounts {
  if (node.kind === "generator") {
    return node.fuel > 0 ? { [GENERATOR.fuel]: node.fuel } : {};
  }
  if (!isProducer(node)) return {};
  const p = node.production;
  const items: ItemCounts = {};
  addCounts(items, p.input);
  const batch = batchOf(node);
  if (batch && p.output > 0) addCounts(items, { [batch.output]: p.output });
  if (batch && p.progress !== null) addCounts(items, batch.inputs);
  if (node.kind === "lab" && node.research !== null) {
    addCounts(items, { [RESEARCH[node.research].pack]: 1 });
  }
  for (const [item, count] of itemEntries(items)) {
    if (count === 0) delete items[item];
  }
  return items;
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
 * Advances `node` by one tick at the grid's `satisfaction` and reports a
 * change of status (FR23).
 */
export function stepProduction(
  node: ProducerNode,
  satisfaction: number,
  emit: Emit,
): void {
  setStatus(node, advance(node.production, batchOf(node), satisfaction), emit);
}
