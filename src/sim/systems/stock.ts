import type { GameState } from "../state/gameState";
import { sumStock } from "../state/stock";

/** The last system of the tick: refreshes the `stock` cache (FR68). */
export function updateStock(state: GameState): void {
  state.stock = sumStock(state.nodes);
}
