import { ITEMS } from "../../../src/data/items";
import type { GameState } from "../../../src/sim/state/gameState";
import type { NodeId } from "../../../src/sim/state/ids";
import { isStorage, store } from "../../../src/sim/state/stock";
import { updateStock } from "../../../src/sim/systems/stock";

/** Puts `perItem` of every item in the Core, so any node is affordable. */
export function fillCore(state: GameState, perItem = 100): void {
  const core = state.nodes.get(1 as NodeId);
  if (!core || !isStorage(core)) throw new Error("no Core at node 1");
  for (const item of ITEMS) store(core, item, perItem);
  updateStock(state);
}
