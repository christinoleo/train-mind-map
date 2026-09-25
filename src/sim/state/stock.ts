import {
  addCounts,
  itemEntries,
  type ItemCounts,
  type ItemId,
} from "../../data/items";
import {
  STORAGE_CAPACITY,
  type Cost,
  type StorageKind,
} from "../../data/nodes";
import { assert } from "../assert";
import type { Rect } from "../geometry/rect";
import { stationCapacity } from "../rail/station";
import type { FactoryNode, GameState, StationNode } from "./gameState";
import type { NodeId } from "./ids";
import { nodeRect } from "./nodes";

/** A node that stores items for the global stock: the Core or a Box. */
export type StorageNode = Extract<FactoryNode, { kind: StorageKind }>;

/** A node that holds items in order of arrival: storage or a Station. */
export type BufferNode = StorageNode | StationNode;

type ItemHolder = Pick<BufferNode, "items">;

export function isStorage(node: FactoryNode): node is StorageNode {
  return node.kind in STORAGE_CAPACITY;
}

export function isBuffer(node: FactoryNode): node is BufferNode {
  return isStorage(node) || node.kind === "station";
}

/** How many items, of every type together, `node` holds at most. */
export function bufferCapacity(
  state: Readonly<GameState>,
  node: Readonly<BufferNode>,
): number {
  return isStorage(node) ? storageCapacity(state, node) : stationCapacity();
}

/** The Core, which the game places at the start and which is never removed. */
export function coreNode(state: Readonly<GameState>): StorageNode {
  for (const node of state.nodes.values()) {
    if (node.kind === "core") return node;
  }
  throw new Error("The game has no Core");
}

/**
 * How many items `node` holds at most: `Infinity` for the Core. Research may
 * raise a Box's.
 */
export function storageCapacity(
  state: Readonly<GameState>,
  node: Readonly<StorageNode>,
): number {
  return node.kind === "core" ? Infinity : state.storageCapacity.box;
}

/** How many more items `node` has room for. */
export function storageRoom(
  state: Readonly<GameState>,
  node: Readonly<StorageNode>,
): number {
  return storageCapacity(state, node) - storedCount(node);
}

/** How many items, of every type together, `node` holds. */
export function storedCount(node: Readonly<ItemHolder>): number {
  let total = 0;
  for (const run of node.items) total += run.count;
  return total;
}

/** What `node` holds, counted by type. */
export function storedItems(node: Readonly<ItemHolder>): ItemCounts {
  const counts: ItemCounts = {};
  for (const { item, count } of node.items) {
    counts[item] = (counts[item] ?? 0) + count;
  }
  return counts;
}

/**
 * Puts `count` of `item` into `node`, behind what it already holds. The
 * caller has checked that it has room.
 */
export function store(node: ItemHolder, item: ItemId, count: number): void {
  const last = node.items.at(-1);
  if (last?.item === item) last.count += count;
  else node.items.push({ item, count });
  // Counts are plain numbers, exact up to 2^53 (see the architecture).
  assert(
    node.items.at(-1)!.count <= Number.MAX_SAFE_INTEGER,
    `${item} count past Number.MAX_SAFE_INTEGER`,
  );
}

/**
 * Takes the item that has waited longest out of `node`, if it holds any: a
 * storage node or Station with an output delivers in order of arrival (FR29).
 */
export function takeOldest(node: ItemHolder): ItemId | undefined {
  const first = node.items[0];
  if (!first) return undefined;
  if (--first.count === 0) node.items.shift();
  return first.item;
}

/**
 * Everything the storage nodes that pass `include` hold, summed: by default
 * the global stock (FR68).
 */
export function sumStock(
  nodes: ReadonlyMap<NodeId, FactoryNode>,
  include: (node: StorageNode) => boolean = () => true,
): ItemCounts {
  const stock: ItemCounts = {};
  for (const node of nodes.values()) {
    if (isStorage(node) && include(node)) {
      addCounts(stock, storedItems(node));
    }
  }
  return stock;
}

/**
 * True when a storage node gives to construction: every one but a Box the
 * player marked "não usar em construção" (FR71).
 */
export function buildsFrom(node: StorageNode): boolean {
  return node.kind === "core" || !node.noConstruction;
}

/**
 * How many items the storage construction draws from holds. It has no
 * limit: the Core is always part of it.
 */
export function constructionStock(state: Readonly<GameState>): number {
  let used = 0;
  for (const node of state.nodes.values()) {
    if (isStorage(node) && buildsFrom(node)) used += storedCount(node);
  }
  return used;
}

/**
 * True when the storage construction draws from holds all of `cost`. It
 * sums the storage nodes rather than reading the cache, which lags the
 * commands applied earlier this tick and counts the Boxes kept out of
 * construction.
 */
export function canAfford(state: Readonly<GameState>, cost: Cost): boolean {
  const stock = sumStock(state.nodes, buildsFrom);
  return itemEntries(cost).every(
    ([item, count]) => (stock[item] ?? 0) >= count,
  );
}

/**
 * The storage nodes in the order construction draws from them for a site at
 * `site` (FR70): warehouses, which have no output edge, before buffers, and
 * the nearest first within each group. Ties go to the lower id. Boxes kept
 * out of construction are left out, of payments and refunds alike (FR71).
 */
export function storageOrder(state: GameState, site: Rect): StorageNode[] {
  const feeding = new Set<NodeId>();
  for (const edge of state.edges.values()) feeding.add(edge.from);
  const key = (node: StorageNode) => ({
    buffer: feeding.has(node.id) ? 1 : 0,
    distance: distanceSq(nodeRect(node), site),
  });
  return [...state.nodes.values()]
    .filter(isStorage)
    .filter(buildsFrom)
    .map((node) => ({ node, ...key(node) }))
    .sort(
      (a, b) =>
        a.buffer - b.buffer || a.distance - b.distance || a.node.id - b.node.id,
    )
    .map(({ node }) => node);
}

/** Items taken from one storage node to pay for construction. */
export interface Draw {
  storage: NodeId;
  item: ItemId;
  count: number;
}

/**
 * Takes `cost` out of storage for a site at `site`, in `storageOrder`, and
 * returns where it came from. The caller has checked `canAfford`.
 */
export function debit(state: GameState, cost: Cost, site: Rect): Draw[] {
  const order = storageOrder(state, site);
  const draws: Draw[] = [];
  for (const [item, count] of itemEntries(cost)) {
    let left = count;
    for (const storage of order) {
      const take = withdraw(storage, item, left);
      if (take === 0) continue;
      draws.push({ storage: storage.id, item, count: take });
      left -= take;
      if (left === 0) break;
    }
    if (left > 0) throw new Error(`debit short of ${item}; check canAfford`);
  }
  return draws;
}

/**
 * Puts `items` into storage near `site`, in `storageOrder`, each Box up to
 * its capacity, and returns what went in. The Core takes whatever is left.
 */
export function deposit(state: GameState, items: Cost, site: Rect): ItemCounts {
  const order = storageOrder(state, site);
  const stored: ItemCounts = {};
  for (const [item, count] of itemEntries(items)) {
    let left = count;
    for (const storage of order) {
      const put = Math.min(left, storageRoom(state, storage));
      if (put <= 0) continue;
      store(storage, item, put);
      stored[item] = (stored[item] ?? 0) + put;
      left -= put;
      if (left === 0) break;
    }
  }
  return stored;
}

/**
 * Takes up to `count` of `item` out of `storage`, the longest-held first,
 * and returns how many it took.
 */
export function withdraw(
  storage: ItemHolder,
  item: ItemId,
  count: number,
): number {
  let left = count;
  for (const run of storage.items) {
    if (run.item !== item) continue;
    const take = Math.min(left, run.count);
    run.count -= take;
    left -= take;
    if (left === 0) break;
  }
  storage.items = storage.items.filter((run) => run.count > 0);
  return count - left;
}

/** Squared distance between the centres of two rects, in cells. */
function distanceSq(a: Rect, b: Rect): number {
  const dx = a.x + a.w / 2 - (b.x + b.w / 2);
  const dy = a.y + a.h / 2 - (b.y + b.h / 2);
  return dx * dx + dy * dy;
}
