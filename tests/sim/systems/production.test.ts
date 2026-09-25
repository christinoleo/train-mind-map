import { describe, expect, it } from "vitest";
import type { ItemId } from "../../../src/data/items";
import type { NodeKind } from "../../../src/data/nodes";
import type { RecipeId } from "../../../src/data/recipes";
import { CommandQueue } from "../../../src/sim/commands/commandQueue";
import type { SimEvent } from "../../../src/sim/events";
import {
  createGameState,
  type ProducerNode,
} from "../../../src/sim/state/gameState";
import { allocateId } from "../../../src/sim/state/ids";
import type { Coverage } from "../../../src/sim/state/map";
import { createNode } from "../../../src/sim/state/nodes";
import {
  acceptItem,
  inputTypes,
  batchTicks,
  extractorCycle,
  takeOutput,
} from "../../../src/sim/state/production";
import { flow } from "../../../src/sim/systems/flow";
import { SYSTEMS, tick } from "../../../src/sim/tick";

/** The systems without edge flow: the tests empty the output buffers themselves. */
const NO_FLOW = SYSTEMS.filter((system) => system !== flow);

/**
 * A game with one producing node, placed directly and powered by the Core,
 * and a tick driver.
 */
/** The input `item` enters `node` by: its typed input, or the first. */
function portFor(node: ProducerNode, item: ItemId): number {
  return Math.max(0, inputTypes(node).indexOf(item));
}

function setup(kind: NodeKind, recipe?: RecipeId, coverage?: Coverage[]) {
  const state = createGameState("production");
  const commands = new CommandQueue();
  const events: SimEvent[] = [];
  const id = allocateId(state.nextIds, "node");
  const node = createNode(id, kind, 0, 0, {
    coverage,
    resource: "iron-ore",
    recipe,
  }) as ProducerNode;
  state.nodes.set(id, node);
  const made: ItemId[] = [];
  /**
   * Runs `n` ticks. Each tick first offers `feed` (as an edge would) and,
   * with `drain`, takes whatever the node finished.
   */
  const run = (n: number, feed: ItemId[] = [], drain = true) => {
    for (let t = 0; t < n; t++) {
      for (const item of feed) acceptItem(node, item, portFor(node, item));
      tick(state, commands, (e) => events.push(e), NO_FLOW);
      const item = drain ? takeOutput(node) : undefined;
      if (item) made.push(item);
    }
  };
  const statuses = () =>
    events.flatMap((e) =>
      e.type === "NodeStatusChanged" ? [[e.status, e.node]] : [],
    );
  return { state, node, run, made, events, statuses };
}

describe("Extractor", () => {
  it("makes 1 item of its resource every 2 s", () => {
    const { run, made } = setup("extractor");
    run(600); // 60 s
    expect(made).toHaveLength(30);
    expect(new Set(made)).toEqual(new Set(["iron-ore"]));
  });

  it("blocks when nothing takes its output, and resumes when it is taken", () => {
    const { node, run, statuses } = setup("extractor");
    run(19, [], false);
    expect(node.production.output).toBe(0);
    run(1, [], false);
    expect(node.production.output).toBe(1);
    // The next item is ready 2 s later but has nowhere to go.
    run(19, [], false);
    expect(node.production.status).toBe("working");
    run(1, [], false);
    expect(node.production.status).toBe("blocked");
    run(50, [], false);
    expect(node.production.output).toBe(1);

    expect(takeOutput(node)).toBe("iron-ore");
    run(1, [], false);
    expect(node.production.output).toBe(1);
    expect(node.production.status).toBe("working");
    expect(statuses()).toEqual([
      ["working", node.id],
      ["blocked", node.id],
      ["working", node.id],
    ]);
  });
});

describe("Extractor on part of a deposit", () => {
  /** Items of each kind an Extractor over `coverage` makes in 60 s. */
  const perMinute = (coverage: Coverage[]) => {
    const { run, made } = setup("extractor", undefined, coverage);
    run(600);
    const counts: Partial<Record<ItemId, number>> = {};
    for (const item of made) counts[item] = (counts[item] ?? 0) + 1;
    return counts;
  };

  it.each([
    [4, 30],
    [2, 15],
    [1, 7.5],
  ])("with %i of its 4 cells on iron makes %d items a minute", (cells, n) => {
    const made = perMinute([{ resource: "iron-ore", cells }]);
    // A partial batch at the end of the minute does not count.
    expect(made["iron-ore"]).toBe(Math.floor(n));
  });

  it("splits 2 iron cells and 1 coal cell into 0.25 iron/s and 0.125 coal/s", () => {
    const { run, made } = setup("extractor", undefined, [
      { resource: "iron-ore", cells: 2 },
      { resource: "coal", cells: 1 },
    ]);
    run(4800); // 480 s: 120 iron and 60 coal
    expect(made.filter((item) => item === "iron-ore")).toHaveLength(120);
    expect(made.filter((item) => item === "coal")).toHaveLength(60);
    // Interleaved through the one output, weighted by cells.
    expect(made.slice(0, 6)).toEqual([
      "iron-ore",
      "coal",
      "iron-ore",
      "iron-ore",
      "coal",
      "iron-ore",
    ]);
  });

  it("holds each resource in the output buffer until it is taken", () => {
    const { node, run } = setup("extractor", undefined, [
      { resource: "iron-ore", cells: 1 },
      { resource: "coal", cells: 1 },
    ]);
    run(200, [], false);
    expect(node.production).toMatchObject({ output: 1, status: "blocked" });
    expect(takeOutput(node)).toBe("iron-ore");
    run(1, [], false);
    expect(takeOutput(node)).toBe("coal");
    expect(takeOutput(node)).toBeUndefined();
  });

  it("interleaves the same way every time", () => {
    const coverage: Coverage[] = [
      { resource: "iron-ore", cells: 1 },
      { resource: "coal", cells: 2 },
      { resource: "stone", cells: 1 },
    ];
    const a = setup("extractor", undefined, coverage);
    const b = setup("extractor", undefined, structuredClone(coverage));
    a.run(1000);
    b.run(1000);
    expect(a.made).toEqual(b.made);
    expect(extractorCycle(coverage)).toEqual([
      "coal",
      "iron-ore",
      "stone",
      "coal",
    ]);
  });
});

describe("Furnace", () => {
  it("smelts 1 iron plate every 3.2 s", () => {
    const { run, made } = setup("furnace");
    run(320, ["iron-ore"]);
    expect(made).toEqual(Array(10).fill("iron-plate"));
  });

  it("picks the smelting recipe of its first input", () => {
    const { node } = setup("furnace");
    expect(acceptItem(node, "stone", 0)).toBe(true);
    expect(node).toMatchObject({ recipe: "brick" });
    // Iron ore has no place while stone is inside.
    expect(acceptItem(node, "iron-ore", 0)).toBe(false);
  });

  it("keeps the recipe it picked, so its input then takes only that ore", () => {
    const { node, run } = setup("furnace");
    acceptItem(node, "copper-ore", 0);
    run(32);
    expect(node.production.output).toBe(0);
    expect(inputTypes(node)).toEqual(["copper-ore"]);
    expect(acceptItem(node, "iron-ore", 0)).toBe(false);
    expect(node).toMatchObject({ recipe: "copper-plate" });
  });

  it("refuses items no smelting recipe takes", () => {
    const { node } = setup("furnace");
    expect(acceptItem(node, "coal", 0)).toBe(false);
    expect(acceptItem(node, "iron-plate", 0)).toBe(false);
  });
});

describe("input buffers", () => {
  it("hold 2× what one batch needs, per item type", () => {
    const { node } = setup("furnace", "brick");
    for (let i = 0; i < 4; i++) expect(acceptItem(node, "stone", 0)).toBe(true);
    expect(acceptItem(node, "stone", 0)).toBe(false);
    expect(node.production.input).toEqual({ stone: 4 });
  });

  it("take every ingredient of the recipe, each in its own buffer", () => {
    const { node } = setup("assembler-1", "circuit");
    const put = (item: ItemId) => acceptItem(node, item, portFor(node, item));
    for (let i = 0; i < 6; i++) put("copper-cable");
    for (let i = 0; i < 2; i++) put("iron-plate");
    expect(put("iron-plate")).toBe(false);
    expect(put("copper-cable")).toBe(false);
    expect(put("gear")).toBe(false);
    expect(node.production.input).toEqual({
      "copper-cable": 6,
      "iron-plate": 2,
    });
  });

  it("refuse everything in an Assembler with no recipe", () => {
    const { node, run } = setup("assembler-1");
    expect(acceptItem(node, "iron-plate", 0)).toBe(false);
    run(10);
    expect(node.production.status).toBe("starved");
  });
});

describe("Assembler 1", () => {
  it("runs at 0.5×: a 1 s gear takes 2 s", () => {
    const { node, run, made } = setup("assembler-1", "gear");
    expect(batchTicks(node)).toBe(20);
    run(600, ["iron-plate", "iron-plate"]);
    expect(made).toEqual(Array(30).fill("gear"));
  });

  it("makes red science every 10 s", () => {
    const { run, made } = setup("assembler-1", "red-science");
    run(600, ["copper-plate", "gear"]);
    expect(made).toEqual(Array(6).fill("red-science"));
  });

  it("makes 2 copper cables a batch, and blocks until both leave", () => {
    const { node, run } = setup("assembler-1", "copper-cable");
    run(10, ["copper-plate"], false);
    expect(node.production.output).toBe(2);
    takeOutput(node);
    run(10, ["copper-plate"], false);
    expect(node.production.status).toBe("blocked");
    takeOutput(node);
    run(1, [], false);
    expect(node.production.output).toBe(2);
    expect(node.production.status).toBe("working");
  });

  it("makes 2 rails from 1 iron plate and 1 stone", () => {
    const { node, run } = setup("assembler-1", "rail");
    run(10, ["iron-plate", "stone"], false);
    expect(node.production.output).toBe(2);
    expect(takeOutput(node)).toBe("rail");
  });

  it("starves without inputs, and works again when they arrive", () => {
    const { node, run, statuses } = setup("assembler-1", "gear");
    run(5);
    expect(node.production.status).toBe("starved");
    acceptItem(node, "iron-plate", 0);
    run(5);
    expect(node.production.status).toBe("starved");
    acceptItem(node, "iron-plate", 0);
    run(20);
    expect(node.production.status).toBe("working");
    run(1);
    expect(node.production.status).toBe("starved");
    expect(statuses()).toEqual([
      ["working", node.id],
      ["starved", node.id],
    ]);
  });
});
