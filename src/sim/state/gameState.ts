import type { ResearchId } from "../../data/research";
import type { EdgeLevel } from "../../data/edges";
import type { ItemCounts, ItemId } from "../../data/items";
import {
  STARTING_NODES,
  STORAGE_CAPACITY,
  type NodeKind,
} from "../../data/nodes";
import type { CrafterKind, RecipeId } from "../../data/recipes";
import type { DepartureCondition } from "../../data/rail";
import type { Scenario } from "../../data/scenarios/scenario";
import type { Point } from "../geometry/planar";
import { generateMap } from "../mapgen/generate";
import { seedRng, type RngState } from "../mapgen/rng";
import { applyScenario } from "../mapgen/scenario";
import {
  allocateId,
  initialNextIds,
  type EdgeId,
  type LineId,
  type NextIds,
  type NodeId,
  type RailId,
  type TrainId,
} from "./ids";
import type { Coverage, GameMap } from "./map";
import { createNode } from "./nodes";
import { newPower, type Power } from "./power";
import { newResearch, type ResearchState } from "./research";
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
 * holding a full output buffer, or stalled by a grid with no power at all.
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
   * grid adds a fraction of a tick per tick (FR64).
   */
  progress: number | null;
}

/** Items of one type that arrived in a row, in a storage node. */
export interface ItemRun {
  item: ItemId;
  count: number;
}

/** A placed node, with the data its kind carries. */
export type FactoryNode = NodeBase &
  (
    | {
        kind: "extractor";
        /** The deposit cells under it, by resource (FR30). */
        coverage: Coverage[];
        /** Its place in the interleave of its resources: see `extractorItem`. */
        turn: number;
        production: Production;
      }
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
        /** Its buffer holds science packs; a batch is one pack (FR40). */
        kind: "lab";
        production: Production;
        /** The research the pack under way was taken for, or `null`. */
        research: ResearchId | null;
      }
    | {
        /**
         * Its buffer between edges and trains (FR92), in order of arrival,
         * the oldest first. It is not storage: the global stock leaves it out.
         */
        kind: "station";
        items: ItemRun[];
      }
    | {
        kind: "generator";
        /** Fuel items waiting in the input buffer. */
        fuel: number;
        /** Ticks left on the fuel item burning now, or 0. */
        burn: number;
      }
  );

/** A node that makes items. */
export type ProducerNode = Extract<FactoryNode, { production: Production }>;

/** A Station, which buffers items between edges and trains (FR41). */
export type StationNode = Extract<FactoryNode, { kind: "station" }>;

/** A Lab, which consumes science packs for the active research (FR40). */
export type LabNode = Extract<FactoryNode, { kind: "lab" }>;

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

/** One end of a rail: a Station's rail port, by its index in `railPorts`. */
export interface RailEnd {
  node: NodeId;
  port: number;
}

/**
 * A double-track rail between two Station rail ports (FR79, FR80), one track
 * each way. Its route runs in 8 directions from the source port's cell to the
 * target port's cell.
 */
export interface Rail {
  id: RailId;
  from: RailEnd;
  to: RailEnd;
  /** The route: its first cell, each bend and its last cell. */
  path: Point[];
}

/** What a train is doing (FR94). */
export type TrainState =
  "loading" | "departing" | "moving" | "waiting_reservation" | "unloading";

/**
 * Something a train reserves (ADR-0005): a Segment, one directed track of a
 * rail, or a Station's platform. Its key names it in the reservation table.
 */
export interface Hold {
  key: string;
  /**
   * Where along the trip the train's tail leaves it, in cells from the
   * trip's start, where the train lets it go; `null` while the train
   * stands at a stop, which it holds until it leaves.
   */
  release: number | null;
}

/**
 * One stretch of a trip: a Segment into a Station, and the Station's
 * platform, where the train can stop. The train reserves both at once.
 */
export interface Leg {
  /** The rail the Segment is a track of. */
  rail: RailId;
  /** The Segment's key in the reservation table. */
  segment: string;
  /** The platform's key in the reservation table. */
  platform: string;
  /** The Station at the leg's end. */
  station: NodeId;
  /** Where the Segment ends, at the Station's rail port, along the trip. */
  enter: number;
  /** Where the train stops on the platform, along the trip. */
  stop: number;
  /** Where the train leaves the platform to go on, or `stop` at the trip's end. */
  exit: number;
}

/**
 * A train's way from one stop to the next, over rails and through the
 * Stations between. Positions along it are in cells from its start.
 */
export interface Trip {
  /** The line the train runs along, in cells, from the start's platform. */
  line: Point[];
  legs: Leg[];
  /** Where the train leaves its start's platform. */
  exit: number;
}

/** A stop of a Line: a Station, and when the train leaves it (FR96). */
export interface LineStop {
  station: NodeId;
  condition: DepartureCondition;
}

/**
 * A fixed ordered list of stops that its trains follow, round and round
 * (FR95). It needs at least two.
 */
export interface Line {
  id: LineId;
  stops: LineStop[];
}

/**
 * What one wagon carries (FR89): items of one type, which the first item
 * loaded sets. An empty wagon has no type.
 */
export interface Wagon {
  item: ItemId | null;
  count: number;
}

/**
 * A train (FR88): a locomotive and its wagons, running between Stations
 * safely by reservation (FR86). Positions are those of the locomotive's
 * front, along the current trip.
 */
export interface Train {
  id: TrainId;
  /** The Line it follows. */
  line: LineId;
  /** Its wagons' loads, the one behind the locomotive first. */
  wagons: Wagon[];
  /** Which of the Line's stops it is at, or heading to while it travels. */
  stop: number;
  state: TrainState;
  /** The Station it stands in at a stop, or `null` while it travels. */
  station: NodeId | null;
  /** The trip under way, or the last one, or `null` before the first. */
  trip: Trip | null;
  /** Front of the locomotive along `trip`, in cells. */
  pos: number;
  /** `pos` at the start of the tick, which the render interpolates from. */
  prevPos: number;
  /** In cells per second. */
  speed: number;
  /** Ticks it has stood at the current stop. */
  waited: number;
  /** Ticks since it last loaded or unloaded an item at the current stop. */
  idle: number;
  /** Ticks it has waited in a row to reserve its trip to the next stop. */
  blocked: number;
  /**
   * The tick it last left its Line's first stop, which starts a round
   * trip, or `null` before it first did.
   */
  lapStart: number | null;
  /** Ticks its last whole round trip took, or `null` before one ended. */
  lap: number | null;
  /** What it has reserved (FR86). */
  holds: Hold[];
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
  /** The rail layer's rails (Epic 5). */
  rails: Map<RailId, Rail>;
  /** The trains, running on the rails (Epic 5). */
  trains: Map<TrainId, Train>;
  /** The Lines the trains follow (FR95). */
  lines: Map<LineId, Line>;
  /**
   * The reservation table (FR86): which train holds each Segment and
   * platform. A derived cache of the trains' holds, never saved.
   */
  reservations: Map<string, TrainId>;
  /** The node kinds the player may build. Research adds to it (Epic 4). */
  unlockedNodes: NodeKind[];
  /** The manual taps left, and the recharge towards the next (FR75). */
  stamina: Stamina;
  /** The Ferramentas research level, which sets the items per tap (Epic 4). */
  tapLevel: number;
  /** The highest edge level research has unlocked (Epic 4). */
  edgeLevel: EdgeLevel;
  /**
   * Items a Box holds; Caixas extras raises it. The Core holds without
   * limit, so it has no entry (FR28).
   */
  storageCapacity: { box: number };
  /** The researches done and under way (FR109). */
  research: ResearchState;
  /**
   * The global stock: everything the storage nodes hold, summed. A derived
   * cache, recomputed at the end of each tick and never saved.
   */
  stock: ItemCounts;
  /** The power grid. Recomputed at the start of each tick and never saved. */
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
    rails: new Map(),
    trains: new Map(),
    lines: new Map(),
    reservations: new Map(),
    unlockedNodes: [...STARTING_NODES],
    stamina: newStamina(),
    tapLevel: 0,
    edgeLevel: 1,
    storageCapacity: { box: STORAGE_CAPACITY.box },
    research: newResearch(),
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
