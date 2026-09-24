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
import type { Rect } from "../geometry/rect";
import type { FactoryNode, GameState } from "./gameState";
import type { NodeId } from "./ids";
import { nodeRect } from "./nodes";

/** A node that stores items for the global stock: the Core or a Box. */
export type StorageNode = Extract<FactoryNode, { kind: StorageKind }>;

export function isStorage(node: FactoryNode): node is StorageNode {
  return node.kind in STORAGE_CAPACITY;
}

/** The Core, which the game places at the start and which is never removed. */
export function coreNode(state: Readonly<GameState>): StorageNode {
  for (const node of state.nodes.values()) {
    if (node.kind === "core") return node;
  }
  throw new Error("The game has no Core");
}

/** How many more items `node` has room for. */
export function storageRoom(node: Readonly<StorageNode>): number {
  return STORAGE_CAPACITY[node.kind] - storedCount(node);
}

/** How many items, of every type together, `node` holds. */
export function storedCount(node: Readonly<StorageNode>): number {
  let total = 0;
  for (const count of Object.values(node.items)) total += count;
  return total;
}

/** Everything the storage nodes hold, summed: the global stock (FR68). */
export function sumStock(nodes: ReadonlyMap<NodeId, FactoryNode>): ItemCounts {
  const stock: ItemCounts = {};
  for (const node of nodes.values()) {
    if (isStorage(node)) addCounts(stock, node.items);
  }
  return stock;
}

/**
 * True when storage holds all of `cost`. It sums the storage nodes rather
 * than reading the cache, which lags the commands applied earlier this tick.
 */
export function canAfford(state: Readonly<GameState>, cost: Cost): boolean {
  const stock = sumStock(state.nodes);
  return itemEntries(cost).every(
    ([item, count]) => (stock[item] ?? 0) >= count,
  );
}

/**
 * The storage nodes in the order construction draws from them for a site at
 * `site` (FR70): warehouses, which have no output edge, before buffers, and
 * the nearest first within each group. Ties go to the lower id.
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
      const take = Math.min(left, storage.items[item] ?? 0);
      if (take === 0) continue;
      withdraw(storage, item, take);
      draws.push({ storage: storage.id, item, count: take });
      left -= take;
      if (left === 0) break;
    }
    if (left > 0) throw new Error(`debit short of ${item}; check canAfford`);
  }
  return draws;
}

/**
 * Puts `items` into storage near `site`, in `storageOrder`, up to each
 * node's capacity, and returns what went in. Whatever finds no room is lost.
 */
export function deposit(state: GameState, items: Cost, site: Rect): ItemCounts {
  const order = storageOrder(state, site);
  const stored: ItemCounts = {};
  for (const [item, count] of itemEntries(items)) {
    let left = count;
    for (const storage of order) {
      const put = Math.min(left, storageRoom(storage));
      if (put <= 0) continue;
      storage.items[item] = (storage.items[item] ?? 0) + put;
      stored[item] = (stored[item] ?? 0) + put;
      left -= put;
      if (left === 0) break;
    }
  }
  return stored;
}

function withdraw(storage: StorageNode, item: ItemId, count: number): void {
  const left = storage.items[item]! - count;
  if (left > 0) storage.items[item] = left;
  else delete storage.items[item];
}

/** Squared distance between the centres of two rects, in cells. */
function distanceSq(a: Rect, b: Rect): number {
  const dx = a.x + a.w / 2 - (b.x + b.w / 2);
  const dy = a.y + a.h / 2 - (b.y + b.h / 2);
  return dx * dx + dy * dy;
}
