import { itemEntries, type ItemId } from "../../data/items";
import type { GameState } from "../state/gameState";
import {
  isStorage,
  storageRoom,
  store,
  storedItems,
  withdraw,
} from "../state/stock";
import type { Rates } from "./steadyState";

/** Rounds a count down, forgiving float error just below a whole number. */
function whole(n: number): number {
  return Math.floor(n + 1e-9);
}

/**
 * Ticks until the first item storage loses runs out. Past it the rates no
 * longer hold: whatever that item fed would stop, and which gains depend
 * on it is unknown, so none go on.
 */
function ticksOfSupply(state: Readonly<GameState>, rates: Rates): number {
  let ticks = Infinity;
  for (const [id, rate] of rates) {
    const node = state.nodes.get(id);
    if (!node || !isStorage(node)) continue;
    const held = storedItems(node);
    for (const [item, perTick] of itemEntries(rate)) {
      if (perTick < 0) ticks = Math.min(ticks, (held[item] ?? 0) / -perTick);
    }
  }
  return ticks;
}

/**
 * Applies `rates` to storage for `ticks` (FR121): each Box and the Core
 * loses what it lost per tick and gains what it gained, a Box up to its
 * capacity and the Core without limit. It stops early once an item storage
 * loses runs out. When a Box's gains do not fit, every item gets the same
 * share of the room.
 */
export function extrapolate(
  state: GameState,
  rates: Rates,
  ticks: number,
): void {
  ticks = Math.min(ticks, ticksOfSupply(state, rates));
  for (const [id, rate] of rates) {
    const node = state.nodes.get(id);
    if (!node || !isStorage(node)) continue;
    const gains: [ItemId, number][] = [];
    for (const [item, perTick] of itemEntries(rate)) {
      const count = whole(Math.abs(perTick) * ticks);
      if (perTick < 0) withdraw(node, item, count);
      else if (count > 0) gains.push([item, count]);
    }
    const total = gains.reduce((sum, [, count]) => sum + count, 0);
    const room = storageRoom(state, node);
    for (const [item, count] of gains) {
      const put = total <= room ? count : whole((count * room) / total);
      if (put > 0) store(node, item, put);
    }
  }
}
