import { describe, expect, it } from "vitest";
import type { NodeKind } from "../../../src/data/nodes";
import { CORE_POWER, GENERATOR } from "../../../src/data/power";
import { CommandQueue } from "../../../src/sim/commands/commandQueue";
import type { SimEvent } from "../../../src/sim/events";
import {
  createGameState,
  type GameState,
  type GeneratorNode,
  type ProducerNode,
} from "../../../src/sim/state/gameState";
import { allocateId, type NodeId } from "../../../src/sim/state/ids";
import { createNode } from "../../../src/sim/state/nodes";
import {
  BURN_TICKS,
  isShort,
  powerSummary,
  satisfactionOf,
  topologyChanged,
} from "../../../src/sim/state/power";
import {
  acceptItem,
  stepProduction,
  takeOutput,
} from "../../../src/sim/state/production";
import {
  deserializeState,
  hashState,
  serializeState,
} from "../../../src/sim/state/serialize";
import { flow } from "../../../src/sim/systems/flow";
import { SYSTEMS, tick } from "../../../src/sim/tick";
import { link } from "../support/power";

/** The systems without edge flow: the tests empty the output buffers themselves. */
const NO_FLOW = SYSTEMS.filter((system) => system !== flow);

const CORE = 1 as NodeId;

/** A game with only the Core, a way to add nodes and a tick driver. */
function setup() {
  const state = createGameState("power");
  const commands = new CommandQueue();
  const events: SimEvent[] = [];
  /** Puts a node straight into the state; the meshes ignore where it sits. */
  const put = (kind: NodeKind, recipe?: "gear") => {
    const id = allocateId(state.nextIds, "node");
    state.nodes.set(
      id,
      createNode(id, kind, 0, 0, { resource: "iron-ore", recipe }),
    );
    topologyChanged(state);
    return id;
  };
  /** Runs `n` ticks, emptying every output buffer after each, as edges would. */
  const run = (n: number, drain = true) => {
    for (let t = 0; t < n; t++) {
      tick(state, commands, (e) => events.push(e), NO_FLOW);
      if (!drain) continue;
      for (const node of state.nodes.values()) takeOutput(node);
    }
  };
  const producer = (id: NodeId) => state.nodes.get(id) as ProducerNode;
  const generator = (id: NodeId) => state.nodes.get(id) as GeneratorNode;
  const meshOf = (id: NodeId) => state.power.meshOf.get(id)!;
  return { state, put, run, events, producer, generator, meshOf };
}

/** The mesh of every node, as groups of ids, sorted for comparison. */
function groups(state: GameState): NodeId[][] {
  return state.power.meshes.map((m) => [...m.nodes].sort((a, b) => a - b));
}

describe("meshes", () => {
  it("group the nodes that edges join, whatever the direction", () => {
    const { state, put, run } = setup();
    const a = put("box");
    const b = put("box");
    const c = put("box");
    link(state, a, CORE);
    link(state, b, c);
    run(1);
    expect(groups(state)).toEqual([
      [CORE, a],
      [b, c],
    ]);
  });

  it("merge when an edge joins two of them", () => {
    const { state, put, run } = setup();
    const a = put("box");
    const b = put("box");
    run(1);
    expect(groups(state)).toEqual([[CORE], [a], [b]]);
    link(state, a, b);
    link(state, CORE, b);
    run(1);
    expect(groups(state)).toEqual([[CORE, a, b]]);
  });

  it("split when the edge between them goes", () => {
    const { state, put, run } = setup();
    const a = put("box");
    const b = put("box");
    link(state, CORE, a);
    const ab = link(state, a, b);
    run(1);
    expect(groups(state)).toEqual([[CORE, a, b]]);
    state.edges.delete(ab);
    topologyChanged(state);
    run(1);
    expect(groups(state)).toEqual([[CORE, a], [b]]);
  });

  it("are rebuilt only when the topology changes", () => {
    const { state, put, run } = setup();
    link(state, put("extractor"), CORE);
    run(1);
    const built = state.power.meshes;
    run(10);
    expect(state.power.meshes).toBe(built);
    put("box");
    run(1);
    expect(state.power.meshes).not.toBe(built);
  });
});

describe("the Core", () => {
  it(`gives ${CORE_POWER} ⚡, enough for the first three Extractors`, () => {
    const { state, put, run, meshOf, producer } = setup();
    const ids = [put("extractor"), put("extractor"), put("extractor")];
    for (const id of ids) link(state, id, CORE);
    run(100);
    expect(meshOf(CORE)).toMatchObject({
      supply: CORE_POWER,
      demand: 3,
      satisfaction: 1,
    });
    expect(isShort(meshOf(CORE))).toBe(false);
    for (const id of ids)
      expect(producer(id).production.status).toBe("working");
  });

  it("slows every node of an overdrawn mesh by supply ÷ demand", () => {
    const { state, put, run, meshOf, producer } = setup();
    const ids = [1, 2, 3, 4].map(() => put("extractor"));
    for (const id of ids) link(state, id, CORE);
    run(2);
    expect(meshOf(CORE)).toMatchObject({ demand: 4, satisfaction: 0.75 });
    expect(isShort(meshOf(CORE))).toBe(true);
    // The first tick ran at full speed: no demand had been measured yet.
    const node = producer(ids[0]);
    expect(node.production.progress).toBe(1.75);
    // 18.25 ticks of the 20-tick batch are left: 25 ticks at 0.75, and the
    // node keeps `working`.
    run(24, false);
    expect(node.production.output).toBe(0);
    run(1, false);
    expect(node.production.output).toBe(1);
    expect(node.production.status).toBe("working");
  });
});

describe("partial satisfaction", () => {
  it.each([
    [10, 11, 22],
    [10, 12, 24],
    [3, 30, 200],
  ])(
    "at %i⚡ for %i⚡ a 20-tick batch takes %i ticks, with no float drift",
    (supply, demand, ticks) => {
      const node = createNode(1 as NodeId, "extractor", 0, 0, {
        resource: "iron-ore",
      }) as ProducerNode;
      let taken = 0;
      while (node.production.output === 0) {
        stepProduction(node, supply / demand, () => {});
        taken++;
      }
      expect(taken).toBe(ticks);
    },
  );
});

describe("demand", () => {
  it("counts only nodes neither starved nor blocked", () => {
    const { state, put, run, meshOf, producer } = setup();
    const extractor = put("extractor");
    const assembler = put("assembler-1", "gear");
    link(state, extractor, CORE);
    link(state, assembler, CORE);
    run(1, false);
    // The Assembler starves; the Extractor works.
    expect(producer(assembler).production.status).toBe("starved");
    run(1, false);
    expect(meshOf(CORE).demand).toBe(1);
    // Once its output is full, the Extractor blocks and draws nothing.
    run(60, false);
    expect(producer(extractor).production.status).toBe("blocked");
    run(1, false);
    expect(meshOf(CORE).demand).toBe(0);
    expect(meshOf(CORE).satisfaction).toBe(1);
  });
});

describe("no power", () => {
  it("stops a node whose mesh has no supply at all", () => {
    const { state, put, run, events, producer, meshOf } = setup();
    const id = put("extractor");
    run(100);
    const node = producer(id);
    expect(meshOf(id)).toMatchObject({ supply: 0, satisfaction: 0 });
    expect(satisfactionOf(state, id)).toBe(0);
    expect(node.production).toMatchObject({ status: "no_power", progress: 0 });
    expect(events).toContainEqual({
      type: "NodeStatusChanged",
      node: id,
      status: "no_power",
    });
    link(state, id, CORE);
    run(1);
    expect(node.production.status).toBe("working");
  });
});

describe("Generator", () => {
  it(`burns 1 coal every ${GENERATOR.seconds} s for ${GENERATOR.power} ⚡`, () => {
    const { state, put, run, generator, meshOf, producer } = setup();
    const gen = put("generator");
    const extractor = put("extractor");
    link(state, extractor, gen);
    expect(acceptItem(state.nodes.get(gen)!, "coal")).toBe(true);
    // The first tick measures no demand yet, so the coal waits.
    run(1);
    expect(generator(gen)).toMatchObject({ fuel: 1, burn: 0 });
    run(1);
    expect(meshOf(gen)).toMatchObject({ supply: GENERATOR.power });
    expect(generator(gen)).toMatchObject({ fuel: 0, burn: BURN_TICKS - 1 });
    run(BURN_TICKS - 1);
    expect(meshOf(gen).supply).toBe(GENERATOR.power);
    expect(generator(gen).burn).toBe(0);
    // The coal is spent and nothing is left to burn.
    run(1);
    expect(meshOf(gen).supply).toBe(0);
    expect(producer(extractor).production.status).toBe("no_power");
  });

  it("burns nothing while its mesh draws no power", () => {
    const { state, put, run, generator, meshOf } = setup();
    const gen = put("generator");
    link(state, put("box"), gen);
    acceptItem(state.nodes.get(gen)!, "coal");
    run(100);
    expect(generator(gen)).toMatchObject({ fuel: 1, burn: 0 });
    expect(meshOf(gen)).toMatchObject({ supply: GENERATOR.power, demand: 0 });
  });

  it(`buffers ${GENERATOR.buffer} coal and takes nothing else`, () => {
    const { state, put } = setup();
    const gen = state.nodes.get(put("generator"))!;
    expect(acceptItem(gen, "iron-ore")).toBe(false);
    for (let i = 0; i < GENERATOR.buffer; i++) {
      expect(acceptItem(gen, "coal")).toBe(true);
    }
    expect(acceptItem(gen, "coal")).toBe(false);
  });

  it("adds to the Core's supply in a shared mesh", () => {
    const { state, put, run, meshOf } = setup();
    const gen = put("generator");
    link(state, CORE, gen);
    link(state, put("extractor"), CORE);
    acceptItem(state.nodes.get(gen)!, "coal");
    run(2);
    expect(meshOf(CORE).supply).toBe(CORE_POWER + GENERATOR.power);
  });
});

describe("determinism", () => {
  it("runs on identically after a save and load", () => {
    const { state, put, run } = setup();
    const gen = put("generator");
    for (let i = 0; i < 12; i++) link(state, put("extractor"), gen);
    acceptItem(state.nodes.get(gen)!, "coal");
    acceptItem(state.nodes.get(gen)!, "coal");
    run(15);
    const restored = deserializeState(
      JSON.parse(JSON.stringify(serializeState(state))),
    );
    const commands = new CommandQueue();
    for (let t = 0; t < 100; t++) {
      tick(state, commands, () => {}, NO_FLOW);
      tick(restored, commands, () => {}, NO_FLOW);
    }
    expect(hashState(restored)).toBe(hashState(state));
  });
});

describe("powerSummary", () => {
  it("adds up every mesh, and is short when any mesh is", () => {
    const { state, put, run } = setup();
    for (let i = 0; i < 4; i++) link(state, put("extractor"), CORE);
    const gen = put("generator");
    link(state, put("extractor"), gen);
    acceptItem(state.nodes.get(gen)!, "coal");
    run(2);
    expect(powerSummary(state.power)).toEqual({
      supply: CORE_POWER + GENERATOR.power,
      demand: 5,
      short: true,
    });
  });
});
