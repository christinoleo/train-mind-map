import type { GameState } from "../../../src/sim/state/gameState";
import { allocateId, type NodeId } from "../../../src/sim/state/ids";
import { topologyChanged } from "../../../src/sim/state/power";

/**
 * Joins `from` and `to` with an edge put straight into the state, skipping
 * the route: meshes read only which nodes an edge joins.
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
  topologyChanged(state);
  return id;
}
