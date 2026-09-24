import { describe, expect, it } from "vitest";
import { FLOW_UNITS_PER_CELL } from "../../../src/config/constants";
import { EDGE_LEVELS, type EdgeLevel } from "../../../src/data/edges";
import type { ItemId } from "../../../src/data/items";
import type { NodeKind } from "../../../src/data/nodes";
import { MVP_SCENARIO } from "../../../src/data/scenarios/mvp";
import { CommandQueue } from "../../../src/sim/commands/commandQueue";
import { ConnectEdge } from "../../../src/sim/commands/connectEdge";
import { RemoveEdge } from "../../../src/sim/commands/removeEdge";
import {
  createGameState,
  type CrafterNode,
  type Edge,
  type ProducerNode,
} from "../../../src/sim/state/gameState";
import {
  allocateId,
  type EdgeId,
  type NodeId,
} from "../../../src/sim/state/ids";
import { link } from "../support/power";
import { fillCore } from "../support/stock";
import { createNode } from "../../../src/sim/state/nodes";
import {
  deserializeState,
  hashState,
  serializeState,
} from "../../../src/sim/state/serialize";
import {
  edgeUnits,
  isEdgeFull,
  spacingUnits,
} from "../../../src/sim/state/edges";
import { STEP_UNITS, stepEdge } from "../../../src/sim/systems/flow";
import { tick } from "../../../src/sim/tick";

/** A bare edge `cells` long at `level`, not attached to any node. */
function bareEdge(level: EdgeLevel, cells = 10): Edge {
  return {
    id: 1 as EdgeId,
    from: 1 as never,
    fromPort: 0,
    to: 2 as never,
    toPort: 0,
    level,
    path: [
      { x: 0, y: 0 },
      { x: cells - 1, y: 0 },
    ],
    items: [],
  };
}

/** Drives `edge` for `ticks` from an endless source into `accept`. */
function drive(
  edge: Edge,
  ticks: number,
  accept: (item: ItemId) => boolean = () => true,
  source: () => ItemId = () => "iron-ore",
) {
  const delivered: ItemId[] = [];
  let taken = 0;
  for (let t = 0; t < ticks; t++) {
    stepEdge(
      edge,
      () => {
        taken++;
        return source();
      },
      (item) => {
        if (!accept(item)) return false;
        delivered.push(item);
        return true;
      },
    );
  }
  return { delivered, taken };
}

describe("edge throughput", () => {
  it.each([
    [1, 2],
    [2, 4],
    [3, 8],
  ] as const)(
    "carries level %i at %i items/s over 60 s",
    (level, perSecond) => {
      const edge = bareEdge(level);
      drive(edge, 100); // warm up until items reach the far end
      const { delivered, taken } = drive(edge, 600);
      expect(delivered).toHaveLength(perSecond * 60);
      expect(taken).toBe(perSecond * 60);
    },
  );

  it.each(
    EDGE_LEVELS.flatMap((level) => [1, 2, 30].map((cells) => [level, cells])),
  )("carries the same at level %i on a %i-cell edge", (level, cells) => {
    const edge = bareEdge(level as EdgeLevel, cells);
    drive(edge, 200);
    expect(drive(edge, 600).delivered).toHaveLength([2, 4, 8][level - 1] * 60);
  });

  it.each(EDGE_LEVELS)("counts whole flow units at level %i", (level) => {
    expect(Number.isInteger(STEP_UNITS)).toBe(true);
    expect(Number.isInteger(spacingUnits(level))).toBe(true);
  });

  it("moves items at 3 cells/s", () => {
    expect(STEP_UNITS * 10).toBe(3 * FLOW_UNITS_PER_CELL);
    const edge = bareEdge(1);
    drive(edge, 11);
    // The first item entered on the first tick and has moved 10 times.
    expect(edge.items[0].pos).toBe(3 * FLOW_UNITS_PER_CELL);
    expect(edge.items[0].prevPos).toBe(edge.items[0].pos - STEP_UNITS);
  });

  it("carries several item types, sharing the throughput, in order", () => {
    const edge = bareEdge(2);
    const kinds: ItemId[] = ["iron-ore", "copper-ore", "coal"];
    let n = 0;
    const { delivered } = drive(edge, 700, undefined, () => kinds[n++ % 3]);
    expect(delivered.length).toBeGreaterThanOrEqual(4 * 60);
    delivered.forEach((item, i) => expect(item).toBe(kinds[i % 3]));
  });
});

describe("back-pressure", () => {
  it("halts the queue when the target refuses, and fills the edge", () => {
    const edge = bareEdge(1, 6);
    const { delivered, taken } = drive(edge, 200, () => false);
    expect(delivered).toEqual([]);
    expect(isEdgeFull(edge)).toBe(true);
    // Packed at the spacing from the input connector back.
    const spacing = spacingUnits(1);
    const end = edgeUnits(edge);
    expect(edge.items.map((it) => it.pos)).toEqual(
      edge.items.map((_, i) => end - i * spacing),
    );
    expect(taken).toBe(edge.items.length);
    // A halted queue takes nothing more, and nothing moves.
    const before = structuredClone(edge.items);
    expect(drive(edge, 50, () => false).taken).toBe(0);
    expect(edge.items.map((it) => it.pos)).toEqual(before.map((it) => it.pos));
  });

  it("resumes at full throughput once the target accepts again", () => {
    const edge = bareEdge(1, 6);
    drive(edge, 200, () => false);
    drive(edge, 1);
    expect(isEdgeFull(edge)).toBe(false);
    drive(edge, 100);
    expect(drive(edge, 600).delivered).toHaveLength(120);
  });

  it("is not full while items still move", () => {
    const edge = bareEdge(1);
    drive(edge, 20);
    expect(isEdgeFull(edge)).toBe(false);
  });

  it("keeps items apart after a downgrade, without moving any back", () => {
    const edge = bareEdge(3, 4);
    drive(edge, 100, () => false);
    edge.level = 1;
    const before = edge.items.map((it) => it.pos);
    drive(edge, 1, () => false);
    edge.items.forEach((it, i) => expect(it.pos).toBe(before[i]));
  });
});

/** An Extractor feeding a Furnace by a level 1 edge, on the MVP map. */
function chain() {
  const state = createGameState(MVP_SCENARIO);
  fillCore(state);
  const commands = new CommandQueue();
  const run = (ticks: number) => {
    for (let t = 0; t < ticks; t++) tick(state, commands, () => {});
  };
  const put = (kind: NodeKind, x: number, y: number) => {
    const id = allocateId(state.nextIds, "node");
    state.nodes.set(id, createNode(id, kind, x, y, { resource: "iron-ore" }));
    return state.nodes.get(id) as ProducerNode;
  };
  const extractor = put("extractor", 50, 50);
  const furnace = put("furnace", 56, 50) as CrafterNode;
  commands.dispatch(
    state,
    new ConnectEdge(
      { node: extractor.id, port: 0 },
      { node: furnace.id, port: 0 },
    ),
  );
  run(1);
  const edge = [...state.edges.values()][0];
  // Powered by the Core: an edge out of it carries nothing, as it makes nothing.
  link(state, 1 as NodeId, extractor.id);
  return { state, commands, run, extractor, furnace, edge };
}

describe("the flow system", () => {
  it("carries an Extractor's output into a Furnace", () => {
    const { run, furnace } = chain();
    run(100);
    expect(furnace.recipe).toBe("iron-plate");
    // Nothing takes the plates, so the first one is still there.
    expect(furnace.production.output).toBe(1);
  });

  it("backs up to the Extractor once the Furnace is full", () => {
    const { run, extractor, furnace, edge } = chain();
    // Nothing takes the plates: the Furnace blocks, then its buffer fills.
    run(1200);
    expect(furnace.production.status).toBe("blocked");
    expect(isEdgeFull(edge)).toBe(true);
    expect(extractor.production.status).toBe("blocked");
  });

  it("loses the items in transit when the edge goes, and comes back empty", () => {
    const { state, commands, run, edge } = chain();
    run(1200);
    expect(edge.items.length).toBeGreaterThan(0);
    commands.dispatch(state, new RemoveEdge(edge.id));
    run(1);
    commands.undo(state);
    tick(state, commands, () => {}, []);
    expect(state.edges.get(edge.id)?.items).toEqual([]);
  });

  it("is deterministic, across a save and load", () => {
    const a = chain();
    const b = chain();
    a.run(900);
    b.run(450);
    const loaded = deserializeState(serializeState(b.state));
    for (let t = 0; t < 450; t++) tick(loaded, b.commands, () => {});
    expect(hashState(loaded)).toBe(hashState(a.state));
  });
});
