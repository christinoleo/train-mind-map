import { describe, expect, it } from "vitest";
import type { NodeKind } from "../../../src/data/nodes";
import { CORE_POWER, GENERATOR } from "../../../src/data/power";
import { CommandQueue } from "../../../src/sim/commands/commandQueue";
import type { SimEvent } from "../../../src/sim/events";
import {
  createGameState,
  type GeneratorNode,
  type ProducerNode,
} from "../../../src/sim/state/gameState";
import { allocateId, type NodeId } from "../../../src/sim/state/ids";
import { createNode } from "../../../src/sim/state/nodes";
import {
  BURN_TICKS,
  isShort,
  powerSummary,
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

/** The systems without edge flow: the tests empty the output buffers themselves. */
const NO_FLOW = SYSTEMS.filter((system) => system !== flow);

const CORE = 1 as NodeId;

/** A game with only the Core, a way to add nodes and a tick driver. */
function setup() {
  const state = createGameState("power");
  const commands = new CommandQueue();
  const events: SimEvent[] = [];
  /** Puts a node straight into the state; the grid ignores where it sits. */
  const put = (kind: NodeKind, recipe?: "gear") => {
    const id = allocateId(state.nextIds, "node");
    state.nodes.set(
      id,
      createNode(id, kind, 0, 0, { resource: "iron-ore", recipe }),
    );
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
  return { state, put, run, events, producer, generator };
}

describe("the grid", () => {
  it("powers nodes with no edge to the Core or to each other", () => {
    const { state, put, run, producer } = setup();
    const id = put("extractor");
    run(1);
    expect(state.power).toMatchObject({ supply: CORE_POWER, satisfaction: 1 });
    expect(producer(id).production.status).toBe("working");
  });

  it("lets a coal Extractor feed a lone Generator that then powers the grid", () => {
    // Playtest softlock 2026-09-25: a coal Extractor and its Generator with
    // no edge to the Core could never start.
    const state = createGameState("power");
    const commands = new CommandQueue();
    const extractor = allocateId(state.nextIds, "node");
    state.nodes.set(
      extractor,
      createNode(extractor, "extractor", 0, 0, { resource: "coal" }),
    );
    const gen = allocateId(state.nextIds, "node");
    state.nodes.set(gen, createNode(gen, "generator", 4, 0));
    const node = state.nodes.get(extractor) as ProducerNode;
    for (let t = 0; t < 1000 && state.power.supply <= CORE_POWER; t++) {
      tick(state, commands, () => {}, NO_FLOW);
      // Carries the coal over the edge, as flow would.
      while (
        node.production.output > 0 &&
        acceptItem(state.nodes.get(gen)!, "coal", 0)
      ) {
        takeOutput(node);
      }
    }
    expect(state.power.supply).toBe(CORE_POWER + GENERATOR.power);
  });
});

describe("the Core", () => {
  it(`gives ${CORE_POWER} ⚡, enough for the first three Extractors`, () => {
    const { state, put, run, producer } = setup();
    const ids = [put("extractor"), put("extractor"), put("extractor")];
    run(100);
    expect(state.power).toMatchObject({
      supply: CORE_POWER,
      demand: 3,
      satisfaction: 1,
    });
    expect(isShort(state.power)).toBe(false);
    for (const id of ids)
      expect(producer(id).production.status).toBe("working");
  });

  it("slows every node of an overdrawn grid by supply ÷ demand", () => {
    const { state, put, run, producer } = setup();
    const ids = [1, 2, 3, 4].map(() => put("extractor"));
    run(2);
    expect(state.power).toMatchObject({ demand: 4, satisfaction: 0.75 });
    expect(isShort(state.power)).toBe(true);
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
    const { state, put, run, producer } = setup();
    const extractor = put("extractor");
    const assembler = put("assembler-1", "gear");
    run(1, false);
    // The Assembler starves; the Extractor works.
    expect(producer(assembler).production.status).toBe("starved");
    run(1, false);
    expect(state.power.demand).toBe(1);
    // Once its output is full, the Extractor blocks and draws nothing.
    run(60, false);
    expect(producer(extractor).production.status).toBe("blocked");
    run(1, false);
    expect(state.power.demand).toBe(0);
    expect(state.power.satisfaction).toBe(1);
  });
});

describe("no power", () => {
  it("never happens while the Core stands", () => {
    const { state, put, run, events } = setup();
    for (let i = 0; i < 30; i++) put("assembler-2", "gear");
    for (let i = 0; i < 30; i++) put("extractor");
    run(200);
    expect(state.power.satisfaction).toBeGreaterThan(0);
    expect(events).not.toContainEqual(
      expect.objectContaining({ status: "no_power" }),
    );
  });

  it("stops every node of a grid with no supply at all", () => {
    const { state, put, run, events, producer } = setup();
    state.nodes.delete(CORE);
    const id = put("extractor");
    run(100);
    const node = producer(id);
    expect(state.power).toMatchObject({ supply: 0, satisfaction: 0 });
    expect(node.production).toMatchObject({ status: "no_power", progress: 0 });
    expect(events).toContainEqual({
      type: "NodeStatusChanged",
      node: id,
      status: "no_power",
    });
  });
});

describe("Generator", () => {
  it(`burns 1 coal every ${GENERATOR.seconds} s for ${GENERATOR.power} ⚡`, () => {
    const { state, put, run, generator, producer } = setup();
    state.nodes.delete(CORE);
    const gen = put("generator");
    const extractor = put("extractor");
    expect(acceptItem(state.nodes.get(gen)!, "coal", 0)).toBe(true);
    // The first tick measures no demand yet, so the coal waits.
    run(1);
    expect(generator(gen)).toMatchObject({ fuel: 1, burn: 0 });
    run(1);
    expect(state.power).toMatchObject({ supply: GENERATOR.power });
    expect(generator(gen)).toMatchObject({ fuel: 0, burn: BURN_TICKS - 1 });
    run(BURN_TICKS - 1);
    expect(state.power.supply).toBe(GENERATOR.power);
    expect(generator(gen).burn).toBe(0);
    // The coal is spent and nothing is left to burn.
    run(1);
    expect(state.power.supply).toBe(0);
    expect(producer(extractor).production.status).toBe("no_power");
  });

  it("burns nothing while the grid draws no power", () => {
    const { state, put, run, generator } = setup();
    const gen = put("generator");
    put("box");
    acceptItem(state.nodes.get(gen)!, "coal", 0);
    run(100);
    expect(generator(gen)).toMatchObject({ fuel: 1, burn: 0 });
    expect(state.power).toMatchObject({
      supply: CORE_POWER + GENERATOR.power,
      demand: 0,
    });
  });

  it(`buffers ${GENERATOR.buffer} coal and takes nothing else`, () => {
    const { state, put } = setup();
    const gen = state.nodes.get(put("generator"))!;
    expect(acceptItem(gen, "iron-ore", 0)).toBe(false);
    for (let i = 0; i < GENERATOR.buffer; i++) {
      expect(acceptItem(gen, "coal", 0)).toBe(true);
    }
    expect(acceptItem(gen, "coal", 0)).toBe(false);
  });

  it("adds to the Core's supply with no edge between them", () => {
    const { state, put, run } = setup();
    const gen = put("generator");
    put("extractor");
    acceptItem(state.nodes.get(gen)!, "coal", 0);
    run(2);
    expect(state.power.supply).toBe(CORE_POWER + GENERATOR.power);
  });
});

describe("determinism", () => {
  it("runs on identically after a save and load", () => {
    const { state, put, run } = setup();
    const gen = put("generator");
    for (let i = 0; i < 12; i++) put("extractor");
    acceptItem(state.nodes.get(gen)!, "coal", 0);
    acceptItem(state.nodes.get(gen)!, "coal", 0);
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
  it("reports the grid's supply and demand, and whether it is short", () => {
    const { state, put, run } = setup();
    for (let i = 0; i < 4; i++) put("extractor");
    run(2);
    expect(powerSummary(state.power)).toEqual({
      supply: CORE_POWER,
      demand: 4,
      short: true,
    });
  });
});
