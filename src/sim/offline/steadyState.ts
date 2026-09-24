import {
  OFFLINE_WINDOW_MS,
  STEADY_TOLERANCE,
  TICK_MS,
} from "../../config/constants";
import { addCounts, itemEntries, type ItemCounts } from "../../data/items";
import type { GameState } from "../state/gameState";
import type { NodeId } from "../state/ids";
import { isProducer } from "../state/production";
import { isStorage, storedItems } from "../state/stock";

/** Ticks in one window the offline fast-forward measures rates over. */
export const WINDOW_TICKS = OFFLINE_WINDOW_MS / TICK_MS;

/** What each storage node holds, by id. */
export type Holdings = Map<NodeId, ItemCounts>;

/**
 * Production rates, in items per tick, by storage node and item: how fast
 * each Box and the Core gains or loses each item. The fast-forward measures
 * them where the items land, so extrapolation can fill each node up to its
 * own capacity (FR121).
 */
export type Rates = Map<NodeId, ItemCounts>;

export function holdings(state: Readonly<GameState>): Holdings {
  const held: Holdings = new Map();
  for (const node of state.nodes.values()) {
    if (isStorage(node)) held.set(node.id, storedItems(node));
  }
  return held;
}

/** The rates from holdings `start` to `end`, `ticks` later. */
export function ratesSince(
  start: Holdings,
  end: Holdings,
  ticks: number,
): Rates {
  const rates: Rates = new Map();
  for (const [id, now] of end) {
    const change = { ...now };
    for (const [item, count] of itemEntries(start.get(id) ?? {})) {
      change[item] = (change[item] ?? 0) - count;
    }
    const rate: ItemCounts = {};
    for (const [item, diff] of itemEntries(change)) {
      if (diff !== 0) rate[item] = diff / ticks;
    }
    rates.set(id, rate);
  }
  return rates;
}

/** True while any node makes items. Labs idle offline. */
function isWorking(state: Readonly<GameState>): boolean {
  for (const node of state.nodes.values()) {
    if (isProducer(node) && node.production.status === "working") return true;
  }
  return false;
}

/** The rates of every storage node together, by item. */
function totals(rates: Rates): ItemCounts {
  const sum: ItemCounts = {};
  for (const rate of rates.values()) addCounts(sum, rate);
  return sum;
}

/**
 * True when two consecutive windows' rates, item by item, differ by less
 * than `STEADY_TOLERANCE` of the larger. A window's count may also differ
 * by one item from where the batches fall in it, which counts as steady:
 * a Furnace's 3.2 s batch fits 18.75 times in a minute.
 */
export function isSteady(
  state: Readonly<GameState>,
  previous: Rates,
  last: Rates,
): boolean {
  const a = totals(previous);
  const b = totals(last);
  const items = new Set([...itemEntries(a), ...itemEntries(b)].map(([i]) => i));
  // Two windows where nothing reached storage while nodes still work are a
  // slow start, not a standstill.
  if (items.size === 0) return !isWorking(state);
  for (const item of items) {
    const x = (a[item] ?? 0) * WINDOW_TICKS;
    const y = (b[item] ?? 0) * WINDOW_TICKS;
    const diff = Math.abs(x - y);
    const bound = STEADY_TOLERANCE * Math.max(Math.abs(x), Math.abs(y));
    if (diff >= bound && diff > 1 + 1e-9) return false;
  }
  return true;
}

/** The mean of two windows' rates, which smooths out where batches fell. */
export function meanRates(a: Rates, b: Rates): Rates {
  const mean: Rates = new Map();
  for (const id of new Set([...a.keys(), ...b.keys()])) {
    const sum = addCounts(addCounts({}, a.get(id) ?? {}), b.get(id) ?? {});
    for (const [item, rate] of itemEntries(sum)) sum[item] = rate / 2;
    mean.set(id, sum);
  }
  return mean;
}
