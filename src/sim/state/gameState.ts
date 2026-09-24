import type { Scenario } from "../../data/scenarios/scenario";
import { generateMap } from "../mapgen/generate";
import { seedRng, type RngState } from "../mapgen/rng";
import { applyScenario } from "../mapgen/scenario";
import { initialNextIds, type EdgeId, type NextIds, type NodeId } from "./ids";
import type { GameMap } from "./map";

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
  map: GameMap;
  nextIds: NextIds;
  nodes: Map<NodeId, FactoryNode>;
  edges: Map<EdgeId, Edge>;
}

/** Starts a game on a free seed's map, or on a scenario stamped over its seed. */
export function createGameState(world: string | Scenario): GameState {
  const seed = typeof world === "string" ? world : world.seed;
  const map = generateMap(seed);
  return {
    tick: 0,
    rng: seedRng(seed),
    map: typeof world === "string" ? map : applyScenario(map, world),
    nextIds: initialNextIds(),
    nodes: new Map(),
    edges: new Map(),
  };
}

/**
 * Replaces `state` in place with a fresh game. The object keeps its identity,
 * so whatever holds it (the renderer, the loop) sees the new map.
 */
export function resetGameState(
  state: GameState,
  world: string | Scenario,
): void {
  Object.assign(state, createGameState(world));
}
