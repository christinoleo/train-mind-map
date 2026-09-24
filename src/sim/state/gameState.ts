import { seedRng, type RngState } from "../mapgen/rng";
import { initialNextIds, type EdgeId, type NextIds, type NodeId } from "./ids";

export interface MapInfo {
  seed: string;
}

export interface FactoryNode {
  id: NodeId;
}

export interface Edge {
  id: EdgeId;
}

/**
 * The whole simulation state, as plain data. Later systems extend it; it never
 * holds render objects, and it changes only through commands.
 */
export interface GameState {
  tick: number;
  rng: RngState;
  map: MapInfo;
  nextIds: NextIds;
  nodes: Map<NodeId, FactoryNode>;
  edges: Map<EdgeId, Edge>;
}

export function createGameState(seed: string): GameState {
  return {
    tick: 0,
    rng: seedRng(seed),
    map: { seed },
    nextIds: initialNextIds(),
    nodes: new Map(),
    edges: new Map(),
  };
}
