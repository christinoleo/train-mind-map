import type { RawResource } from "../../data/items";
import { STARTING_NODES, type NodeKind } from "../../data/nodes";
import type { Scenario } from "../../data/scenarios/scenario";
import { generateMap } from "../mapgen/generate";
import { seedRng, type RngState } from "../mapgen/rng";
import { applyScenario } from "../mapgen/scenario";
import {
  allocateId,
  initialNextIds,
  type EdgeId,
  type NextIds,
  type NodeId,
} from "./ids";
import type { GameMap } from "./map";

interface NodeBase {
  id: NodeId;
  /** Top-left cell of the footprint; the size comes from `NODES[kind]`. */
  x: number;
  y: number;
}

/** A placed node. Kinds that carry their own data add it here. */
export type FactoryNode = NodeBase &
  (
    | { kind: "extractor"; resource: RawResource }
    | { kind: Exclude<NodeKind, "extractor"> }
  );

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
  /** The node kinds the player may build. Research adds to it (Epic 4). */
  unlockedNodes: NodeKind[];
}

/** Starts a game on a free seed's map, or on a scenario stamped over its seed. */
export function createGameState(world: string | Scenario): GameState {
  const seed = typeof world === "string" ? world : world.seed;
  const generated = generateMap(seed);
  const map =
    typeof world === "string" ? generated : applyScenario(generated, world);
  const nextIds = initialNextIds();
  // The Core starts placed, on the cells the map reserved for it.
  const core: FactoryNode = {
    id: allocateId(nextIds, "node"),
    kind: "core",
    x: map.core.x,
    y: map.core.y,
  };
  return {
    tick: 0,
    rng: seedRng(seed),
    map,
    nextIds,
    nodes: new Map([[core.id, core]]),
    edges: new Map(),
    unlockedNodes: [...STARTING_NODES],
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
