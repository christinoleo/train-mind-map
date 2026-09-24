import { itemEntries, type ItemId } from "../../data/items";
import type { GameState } from "../state/gameState";
import { isStorage, storageRoom, store, withdraw } from "../state/stock";
import type { Rates } from "./steadyState";

/** Rounds a count down, forgiving float error just below a whole number. */
function whole(n: number): number {
  return Math.floor(n + 1e-9);
}

/**
 * Applies `rates` to storage for `ticks` (FR121): each Box and the Core
 * loses what it lost per tick, down to empty, and gains what it gained,
 * up to its capacity. When the gains do not fit, every item gets the same
 * share of the room.
 */
export function extrapolate(
  state: GameState,
  rates: Rates,
  ticks: number,
): void {
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
