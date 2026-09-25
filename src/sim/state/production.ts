import {
  addCounts,
  itemEntries,
  type ItemCounts,
  type ItemId,
  type RawResource,
} from "../../data/items";
import { NODES } from "../../data/nodes";
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
import type { Coverage } from "./map";

type ExtractorNode = Extract<FactoryNode, { kind: "extractor" }>;

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
      output: extractorItem(node),
      count: 1,
      ticks: extractorTicks(node.coverage),
    };
  }
  if (node.recipe === null) return undefined;
  const { inputs, output, count, seconds } = RECIPES[node.recipe];
  const ticks = secondsToTicks(seconds / CRAFTERS[node.kind].speed);
  return { inputs, output, count, ticks };
}

/** The fraction of an Extractor's cells on deposits of `resource` (FR30). */
export function coverageShare(
  coverage: readonly Coverage[],
  resource?: RawResource,
): number {
  const cells = coverage
    .filter((part) => resource === undefined || part.resource === resource)
    .reduce((sum, part) => sum + part.cells, 0);
  return cells / NODES.extractor.size ** 2;
}

/**
 * Ticks an Extractor takes per item: the base time divided by the fraction
 * of its cells on deposits, so 1 cell of 4 makes items at ¼ speed (FR30).
 * It need not be a whole number of ticks: see `advance`.
 */
export function extractorTicks(coverage: readonly Coverage[]): number {
  return secondsToTicks(EXTRACTOR_SECONDS) / coverageShare(coverage);
}

/**
 * The resources an Extractor makes, one per item, over one cycle: each as
 * many times as it has cells, spread evenly by a smooth weighted round
 * robin. Over 2 iron cells and 1 coal cell it makes iron, coal, iron.
 */
export function extractorCycle(coverage: readonly Coverage[]): RawResource[] {
  const total = coverage.reduce((sum, part) => sum + part.cells, 0);
  const credit = coverage.map(() => 0);
  const cycle: RawResource[] = [];
  for (let n = 0; n < total; n++) {
    let best = 0;
    coverage.forEach((part, i) => {
      credit[i] += part.cells;
      if (credit[i] > credit[best]) best = i;
    });
    credit[best] -= total;
    cycle.push(coverage[best].resource);
  }
  return cycle;
}

/** The resource of the item an Extractor makes next, or holds finished. */
export function extractorItem(node: Readonly<ExtractorNode>): RawResource {
  const cycle = extractorCycle(node.coverage);
  return cycle[node.turn % cycle.length];
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
  pending: Readonly<ItemCounts> = {},
): RecipeId | null {
  if (node.kind !== "furnace" || !isEmpty(node.production)) return node.recipe;
  for (const [coming] of itemEntries(pending)) {
    const recipe = smeltingFor(coming);
    if (recipe) return recipe;
  }
  return smeltingFor(item) ?? node.recipe;
}

/**
 * What one batch of `node` needs of each item it takes, once `pending`, the
 * items already on its way to it, and then `item` have arrived: the active
 * recipe's inputs, a Generator's fuel (FR67), or a Lab's science packs
 * (FR40), one of each.
 */
export function inputNeeds(
  node: FactoryNode,
  item: ItemId,
  pending: Readonly<ItemCounts> = {},
): ItemCounts {
  if (node.kind === "lab") {
    return Object.fromEntries(SCIENCE_PACKS.map((pack) => [pack, 1]));
  }
  if (node.kind === "generator") return { [GENERATOR.fuel]: 1 };
  if (!isCrafter(node)) return {};
  const recipe = recipeOn(node, item, pending);
  return recipe === null ? {} : RECIPES[recipe].inputs;
}

/** How many of `item` wait in `node`'s input buffers. */
export function heldInput(node: FactoryNode, item: ItemId): number {
  if (node.kind === "generator") return item === GENERATOR.fuel ? node.fuel : 0;
  return isProducer(node) ? (node.production.input[item] ?? 0) : 0;
}

/**
 * How many of an item `node` holds at most, when one batch needs `need` of
 * it: 2× that for a crafter (FR24), and a Lab's or Generator's own size.
 */
export function inputLimit(node: FactoryNode, need: number): number {
  if (node.kind === "lab") return LAB.buffer;
  if (node.kind === "generator") return GENERATOR.buffer;
  return 2 * need;
}

/** True when `node` takes `item` now: it needs it and its buffer has room. */
function wouldAccept(node: FactoryNode, item: ItemId): boolean {
  const need = inputNeeds(node, item)[item];
  return !!need && heldInput(node, item) < inputLimit(node, need);
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
  if (isCrafter(node)) node.recipe = recipeOn(node, item);
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
  // An Extractor's next item is the next resource in its cycle.
  if (node.kind === "extractor") node.turn++;
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
  // A batch with no inputs, an Extractor's, starts the next at once with the
  // fraction of a tick this one ran over, so batches of 26⅔ ticks take 26⅔
  // on average rather than 27.
  const needsInputs = Object.keys(batch.inputs).length > 0;
  p.progress = needsInputs ? null : Math.max(0, p.progress - batch.ticks);
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
