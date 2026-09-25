import { describe, expect, it } from "vitest";
import type { ItemId } from "../../../src/data/items";
import { STORAGE_CAPACITY, type NodeKind } from "../../../src/data/nodes";
import { MVP_SCENARIO } from "../../../src/data/scenarios/mvp";
import type { SimEvent } from "../../../src/sim/events";
import {
  edgeUnits,
  isEdgeFull,
  spacingUnits,
} from "../../../src/sim/state/edges";
import {
  createGameState,
  type Edge,
  type FactoryNode,
} from "../../../src/sim/state/gameState";
import { allocateId } from "../../../src/sim/state/ids";
import { createNode } from "../../../src/sim/state/nodes";
import {
  coreNode,
  store,
  storedCount,
  storedItems,
  sumStock,
} from "../../../src/sim/state/stock";
import { stationCapacity } from "../../../src/sim/rail/station";
import { flow } from "../../../src/sim/systems/flow";

/**
 * A factory built straight into the MVP state, where only the flow system
 * runs: nodes sit anywhere, and each edge is a straight run of cells.
 */
function world() {
  const state = createGameState(MVP_SCENARIO);
  const events: SimEvent[] = [];
  const put = <K extends NodeKind>(
    kind: K,
    options?: Parameters<typeof createNode>[4],
  ) => {
    const id = allocateId(state.nextIds, "node");
    const node = createNode(id, kind, 0, 0, options);
    state.nodes.set(id, node);
    return node as FactoryNode & { kind: K };
  };
  const box = (...runs: [ItemId, number][]) => {
    const node = put("box");
    for (const [item, count] of runs) store(node, item, count);
    return node;
  };
  const wire = (
    from: FactoryNode,
    fromPort: number,
    to: FactoryNode,
    toPort = 0,
    level: 1 | 2 | 3 = 3,
  ): Edge => {
    const id = allocateId(state.nextIds, "edge");
    const edge: Edge = {
      id,
      from: from.id,
      fromPort,
      to: to.id,
      toPort,
      level,
      path: [
        { x: 0, y: 0 },
        { x: 3, y: 0 },
      ],
      items: [],
    };
    state.edges.set(id, edge);
    return edge;
  };
  const run = (ticks: number) => {
    for (let t = 0; t < ticks; t++)
      flow(state, { emit: (e) => events.push(e) });
  };
  return { state, events, put, box, wire, run };
}

/** A Box with no room left. */
function fullBox(w: ReturnType<typeof world>) {
  return w.box(["stone", STORAGE_CAPACITY.box]);
}

describe("the Splitter (FR37)", () => {
  it("shares its input evenly across its outputs, in turn", () => {
    const w = world();
    const source = w.box(["iron-ore", 30]);
    const splitter = w.put("splitter");
    const sinks = [w.box(), w.box(), w.box()];
    w.wire(source, 0, splitter);
    sinks.forEach((sink, port) => w.wire(splitter, port, sink));
    w.run(300);
    expect(sinks.map(storedCount)).toEqual([10, 10, 10]);
  });

  it("skips an output whose node refuses and keeps feeding the others", () => {
    const w = world();
    const source = w.box(["iron-ore", 40]);
    const splitter = w.put("splitter");
    const [a, full, c] = [w.box(), fullBox(w), w.box()];
    w.wire(source, 0, splitter);
    w.wire(splitter, 0, a);
    const refused = w.wire(splitter, 1, full);
    w.wire(splitter, 2, c);
    w.run(400);
    expect(refused.items).toEqual([]);
    expect(storedCount(a) + storedCount(c)).toBe(40);
    expect(Math.abs(storedCount(a) - storedCount(c))).toBeLessThanOrEqual(1);
    expect(splitter.blocked).toBe(false);
  });

  it("carries a single output at its edge's full throughput", () => {
    const w = world();
    const source = w.box(["iron-ore", 400]);
    const splitter = w.put("splitter");
    const sink = w.box();
    w.wire(source, 0, splitter, 0, 3);
    w.wire(splitter, 1, sink, 0, 2);
    w.run(50);
    const before = storedCount(sink);
    w.run(600);
    // Level 2: 4 items/s over 60 s.
    expect(storedCount(sink) - before).toBe(240);
  });

  it("is blocked, and says so, only when every output is", () => {
    const w = world();
    // An Extractor sends whatever it makes, taken or not.
    const source = w.put("extractor", { resource: "iron-ore" });
    source.production.output = 1;
    const splitter = w.put("splitter");
    w.wire(source, 0, splitter);
    w.wire(splitter, 0, fullBox(w));
    w.wire(splitter, 2, fullBox(w));
    w.run(400);
    expect(splitter.blocked).toBe(true);
    expect(w.events).toContainEqual({
      type: "NodeStatusChanged",
      node: splitter.id,
      status: "blocked",
    });
  });
});

describe("the Merger (FR38)", () => {
  it("gives every busy input an equal share of its output", () => {
    const w = world();
    const merger = w.put("merger");
    const sink = w.box();
    const items: ItemId[] = ["iron-ore", "copper-ore", "coal"];
    items.forEach((item, port) => w.wire(w.box([item, 200]), 0, merger, port));
    // Level 1 out: the output is the bottleneck, so the inputs queue.
    w.wire(merger, 0, sink, 0, 1);
    w.run(600);
    const got = storedItems(sink);
    const shares = items.map((item) => got[item] ?? 0);
    expect(shares.reduce((a, b) => a + b)).toBeGreaterThan(100);
    expect(Math.max(...shares) - Math.min(...shares)).toBeLessThanOrEqual(1);
  });

  it("gives an input the whole output while the others are empty", () => {
    const w = world();
    const merger = w.put("merger");
    const sink = w.box();
    w.wire(w.box(), 0, merger, 0);
    w.wire(w.box(["coal", 400]), 0, merger, 2);
    w.wire(merger, 0, sink, 0, 1);
    w.run(50);
    const before = storedCount(sink);
    w.run(600);
    expect(storedCount(sink) - before).toBe(120);
  });
});

describe("storage nodes on edges (FR28, FR29, FR73)", () => {
  it("sends a Box's items out in order of arrival", () => {
    const w = world();
    const source = w.box(["stone", 3], ["coal", 2], ["stone", 1]);
    const sink = w.box();
    w.wire(source, 0, sink);
    w.run(100);
    expect(source.items).toEqual([]);
    expect(sink.items).toEqual([
      { item: "stone", count: 3 },
      { item: "coal", count: 2 },
      { item: "stone", count: 1 },
    ]);
  });

  it("shares a Box's oldest items between its two outputs", () => {
    const w = world();
    const source = w.box(["stone", 10]);
    const [a, b] = [w.box(), w.box()];
    w.wire(source, 0, a);
    w.wire(source, 1, b);
    w.run(100);
    expect(storedCount(a) + storedCount(b)).toBe(10);
    expect(storedCount(a)).toBeGreaterThan(0);
    expect(storedCount(b)).toBeGreaterThan(0);
  });

  it("stops sending to a Box once it is full, and loses nothing", () => {
    const w = world();
    const source = w.box(["coal", 20]);
    const sink = w.box(["stone", STORAGE_CAPACITY.box - 5]);
    const edge = w.wire(source, 0, sink);
    w.run(300);
    expect(storedCount(sink)).toBe(STORAGE_CAPACITY.box);
    expect(edge.items).toEqual([]);
    expect(storedCount(source)).toBe(15);
  });

  it("lets the Core receive items by edge", () => {
    const w = world();
    const core = coreNode(w.state);
    w.wire(w.box(["brick", 7]), 0, core, 3);
    w.run(100);
    expect(storedItems(core)).toEqual({ brick: 7 });
  });

  it("lets a Core holding a million stone still take iron by edge", () => {
    const w = world();
    const core = coreNode(w.state);
    store(core, "stone", 1_000_000);
    w.wire(w.box(["iron-ore", 7]), 0, core, 3);
    w.run(100);
    expect(storedItems(core)).toEqual({ stone: 1_000_000, "iron-ore": 7 });
  });
});

describe("the Station's buffer (FR92)", () => {
  it("fills from its input edges up to twice the largest train's load", () => {
    const w = world();
    const station = w.put("station");
    const sources = [w.box(["iron-plate", 150]), w.box(["copper-plate", 150])];
    const edges = sources.map((source, port) =>
      w.wire(source, 0, station, port),
    );
    w.run(1200);
    expect(stationCapacity()).toBe(200);
    expect(storedCount(station)).toBe(200);
    expect(edges.every((edge) => edge.items.length === 0)).toBe(true);
  });

  it("backs up its input edges once full, and loses nothing", () => {
    const w = world();
    const station = w.put("station");
    // An Extractor sends whatever it makes, taken or not.
    const source = w.put("extractor", { resource: "iron-ore" });
    store(station, "iron-plate", stationCapacity() - 5);
    const edge = w.wire(source, 0, station);
    let sent = 0;
    for (let t = 0; t < 1200; t++) {
      source.production.output = 1;
      w.run(1);
      sent += 1 - source.production.output;
    }
    expect(isEdgeFull(edge)).toBe(true);
    expect(storedCount(station)).toBe(stationCapacity());
    expect(5 + edge.items.length).toBe(sent);
  });

  it("drains through its output edges, the oldest items first", () => {
    const w = world();
    const station = w.put("station");
    store(station, "iron-plate", 2);
    store(station, "brick", 1);
    const sink = w.box();
    w.wire(station, 2, sink);
    w.run(100);
    expect(storedCount(station)).toBe(0);
    expect(sink.items).toEqual([
      { item: "iron-plate", count: 2 },
      { item: "brick", count: 1 },
    ]);
  });

  it("stays out of the global stock", () => {
    const w = world();
    const station = w.put("station");
    store(station, "iron-plate", 10);
    expect(sumStock(w.state.nodes)["iron-plate"]).toBeUndefined();
  });
});

/**
 * Runs the flow while `assembler`, on rails, consumes a batch whenever it
 * has one, as production would, and returns how many batches it made.
 */
function railBatches(
  w: ReturnType<typeof world>,
  assembler: FactoryNode & { kind: "assembler-1" },
) {
  const { input } = assembler.production;
  let batches = 0;
  for (let t = 0; t < 1500; t++) {
    w.run(1);
    if ((input["iron-plate"] ?? 0) >= 1 && (input.stone ?? 0) >= 1) {
      input["iron-plate"]!--;
      input.stone!--;
      batches++;
    }
  }
  return batches;
}

describe("items a node refuses (FR57)", () => {
  it("sends a Furnace only what its recipe takes, the rest staying in the Core", () => {
    const w = world();
    const core = coreNode(w.state);
    store(core, "stone", 3);
    store(core, "copper-ore", 1);
    const furnace = w.put("furnace");
    const edge = w.wire(core, 0, furnace);
    w.run(100);
    expect(furnace).toMatchObject({
      recipe: "brick",
      production: { input: { stone: 3 } },
    });
    expect(storedItems(core)).toEqual({ "copper-ore": 1 });
    expect(edge.items).toEqual([]);
    store(core, "stone", 1);
    w.run(100);
    expect(furnace.production.input).toEqual({ stone: 4 });
  });

  it("lets the items behind a refused one pass", () => {
    const w = world();
    const core = coreNode(w.state);
    store(core, "stone", 4);
    const furnace = w.put("furnace", { recipe: "brick" });
    furnace.production.input = { stone: 1 };
    const edge = w.wire(core, 0, furnace);
    // Put on the edge before the Furnace was set to bricks.
    edge.items.push({ item: "copper-ore", pos: 0, prevPos: 0 });
    w.run(200);
    expect(furnace.production.input).toEqual({ stone: 4 });
    expect(edge.items[0].item).toBe("copper-ore");
    expect(edge.items.slice(1).every(({ item }) => item === "stone")).toBe(
      true,
    );
  });

  it("backs a long edge to a Furnace up past its buffer, as to a Box", () => {
    const w = world();
    const core = coreNode(w.state);
    store(core, "iron-ore", 1000);
    const furnace = w.put("furnace", { recipe: "iron-plate" });
    const edge = w.wire(core, 0, furnace);
    edge.path = [
      { x: 0, y: 0 },
      { x: 59, y: 0 },
    ];
    w.run(1200);
    const slots = Math.floor(edgeUnits(edge) / spacingUnits(edge)) + 1;
    expect(furnace.production.input).toEqual({ "iron-ore": 2 });
    // Every slot but one, which stays free for any other input.
    expect(edge.items.length).toBe(slots - 1);
  });

  it("sends a Lab only science packs", () => {
    const w = world();
    const core = coreNode(w.state);
    store(core, "stone", 10);
    store(core, "red-science", 2);
    const lab = w.put("lab");
    w.wire(core, 0, lab);
    w.run(100);
    expect(lab.production.input).toEqual({ "red-science": 2 });
    expect(storedItems(core)).toEqual({ stone: 10 });
  });

  it("feeds an Assembler every input, whichever the Core holds first", () => {
    const w = world();
    const core = coreNode(w.state);
    store(core, "iron-plate", 50);
    store(core, "stone", 50);
    const assembler = w.put("assembler-1", { recipe: "rail" });
    w.wire(core, 0, assembler);
    expect(railBatches(w, assembler)).toBeGreaterThanOrEqual(20);
  });

  it("routes a Box's items through a Splitter only to the nodes that take them", () => {
    const w = world();
    const source = w.box(["copper-ore", 5], ["stone", 10], ["iron-ore", 10]);
    const splitter = w.put("splitter");
    const bricks = w.put("furnace", { recipe: "brick" });
    bricks.production.input = { stone: 1 };
    const plates = w.put("furnace", { recipe: "iron-plate" });
    plates.production.input = { "iron-ore": 1 };
    w.wire(source, 0, splitter);
    const [toBricks, toPlates] = [
      w.wire(splitter, 0, bricks),
      w.wire(splitter, 1, plates),
    ];
    w.run(400);
    expect(bricks.production.input).toEqual({ stone: 4 });
    expect(plates.production.input).toEqual({ "iron-ore": 2 });
    const carried = (edge: Edge) => new Set(edge.items.map((it) => it.item));
    expect([...carried(toBricks)]).toEqual(["stone"]);
    expect([...carried(toPlates)]).toEqual(["iron-ore"]);
    expect(splitter.blocked).toBe(false);
    expect(storedItems(source)["copper-ore"]).toBe(5);
  });

  it("merges Boxes into an Assembler without jamming on either input", () => {
    const w = world();
    const plates = w.box(["iron-plate", 20]);
    const mixed = w.box(["iron-plate", 20], ["stone", 20]);
    const merger = w.put("merger");
    const assembler = w.put("assembler-1", { recipe: "rail" });
    w.wire(plates, 0, merger, 0);
    w.wire(mixed, 0, merger, 1);
    w.wire(merger, 0, assembler);
    expect(railBatches(w, assembler)).toBe(20);
    expect(merger.blocked).toBe(false);
  });
});
