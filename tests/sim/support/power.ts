import type { GameState } from "../../../src/sim/state/gameState";
import { allocateId, type NodeId } from "../../../src/sim/state/ids";

/**
 * Joins `from` and `to` with an edge put straight into the state, skipping
 * the route.
 */
export function link(state: GameState, from: NodeId, to: NodeId) {
  const id = allocateId(state.nextIds, "edge");
  state.edges.set(id, {
    id,
    from,
    fromPort: 0,
    to,
    toPort: 0,
    level: 1,
    path: [],
    items: [],
  });
  return id;
}
