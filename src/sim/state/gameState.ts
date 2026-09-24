import type { EdgeLevel } from "../../data/edges";
import type { ItemCounts, ItemId, RawResource } from "../../data/items";
import {
  STARTING_NODES,
  type NodeKind,
  type StorageKind,
} from "../../data/nodes";
import type { CrafterKind, RecipeId } from "../../data/recipes";
import type { Scenario } from "../../data/scenarios/scenario";
import type { Point } from "../geometry/planar";
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
import { createNode } from "./nodes";
import { newPower, type Power } from "./power";
import { newStamina, type Stamina } from "./stamina";
import { sumStock } from "./stock";

interface NodeBase {
  id: NodeId;
  /** Top-left cell of the footprint; the size comes from `NODES[kind]`. */
  x: number;
  y: number;
}

/**
 * What a producing node is doing (FR23): making a batch, waiting for inputs,
 * holding a full output buffer, or stalled by a mesh with no power at all.
 */
export type NodeStatus = "working" | "starved" | "blocked" | "no_power";

/** The buffers and progress of a node that makes items (FR24–FR26). */
export interface Production {
  status: NodeStatus;
  /** Items waiting in the input buffers, by type. */
  input: Partial<Record<ItemId, number>>;
  /** Finished items waiting to leave, all of the output item. */
  output: number;
  /**
   * Ticks of work on the current batch, or `null` between batches. A short
   * mesh adds a fraction of a tick per tick (FR64).
   */
  progress: number | null;
}

/** Items of one type that arrived in a row, in a storage node. */
export interface ItemRun {
  item: ItemId;
  count: number;
}

/** A placed node. Kinds that carry their own data add it here. */
export type FactoryNode = NodeBase &
  (
    | { kind: "extractor"; resource: RawResource; production: Production }
    | {
        kind: CrafterKind;
        /** The recipe it runs; a Furnace picks one from its first input. */
        recipe: RecipeId | null;
        production: Production;
      }
    | {
        kind: "core";
        /** What it holds, in order of arrival, the oldest first (FR29). */
        items: ItemRun[];
      }
    | {
        kind: "box";
        items: ItemRun[];
        /** "Não usar em construção": construction never draws from it (FR71). */
        noConstruction: boolean;
      }
    | {
        kind: "splitter" | "merger";
        /**
         * The connector whose turn is next in the round robin: an output of
         * a Splitter (FR37), an input of a Merger (FR38).
         */
        next: number;
        /** An item waits at it that no output can take (FR37). */
        blocked: boolean;
      }
    | {
        kind: "generator";
        /** Fuel items waiting in the input buffer. */
        fuel: number;
        /** Ticks left on the fuel item burning now, or 0. */
        burn: number;
      }
    | {
        kind: Exclude<
          NodeKind,
          | "extractor"
          | CrafterKind
          | StorageKind
          | "generator"
          | "splitter"
          | "merger"
        >;
      }
  );

/** A node that makes items. */
export type ProducerNode = Extract<FactoryNode, { production: Production }>;

/** A node that burns fuel for power (FR32). */
export type GeneratorNode = Extract<FactoryNode, { kind: "generator" }>;

/** A Furnace or Assembler: a node that runs a recipe. */
export type CrafterNode = Extract<FactoryNode, { kind: CrafterKind }>;

/** An item on its way along an edge (FR55–FR57). */
export interface EdgeItem {
  item: ItemId;
  /** Distance from the output connector, in flow units (`FLOW_UNITS_PER_CELL`). */
  pos: number;
  /** `pos` at the start of the tick, which the render interpolates from. */
  prevPos: number;
}

export interface Edge {
  id: EdgeId;
  /** The node whose output the edge leaves from. */
  from: NodeId;
  /** Which of its output connectors, counted from the top. */
  fromPort: number;
  /** The node whose input the edge enters. */
  to: NodeId;
  /** Which of its input connectors, counted from the top. */
  toPort: number;
  level: EdgeLevel;
  /** The route: its first cell, each bend and its last cell (ADR-0007). */
  path: Point[];
  /** The items in transit, the one nearest the input connector first. */
  items: EdgeItem[];
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
  /** The manual taps left, and the recharge towards the next (FR75). */
  stamina: Stamina;
  /** The Ferramentas research level, which sets the items per tap (Epic 4). */
  tapLevel: number;
  /** The highest edge level research has unlocked (Epic 4). */
  edgeLevel: EdgeLevel;
  /**
   * The global stock: everything the storage nodes hold, summed. A derived
   * cache, recomputed at the end of each tick and never saved.
   */
  stock: ItemCounts;
  /** The power meshes. A derived cache, rebuilt when the topology changes. */
  power: Power;
}

/** Starts a game on a free seed's map, or on a scenario stamped over its seed. */
export function createGameState(world: string | Scenario): GameState {
  const seed = typeof world === "string" ? world : world.seed;
  const generated = generateMap(seed);
  const map =
    typeof world === "string" ? generated : applyScenario(generated, world);
  const nextIds = initialNextIds();
  // The Core starts placed, on the cells the map reserved for it.
  const core = createNode(
    allocateId(nextIds, "node"),
    "core",
    map.core.x,
    map.core.y,
  );
  const nodes = new Map([[core.id, core]]);
  return {
    tick: 0,
    rng: seedRng(seed),
    map,
    nextIds,
    nodes,
    edges: new Map(),
    unlockedNodes: [...STARTING_NODES],
    stamina: newStamina(),
    tapLevel: 0,
    edgeLevel: 1,
    stock: sumStock(nodes),
    power: newPower(),
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
