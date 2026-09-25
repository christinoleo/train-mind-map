import { describe, expect, it } from "vitest";
import { itemEntries, type ItemCounts } from "../../../src/data/items";
import { MVP_SCENARIO } from "../../../src/data/scenarios/mvp";
import type { Command } from "../../../src/sim/commands/command";
import { CommandQueue } from "../../../src/sim/commands/commandQueue";
import { PlaceNode } from "../../../src/sim/commands/placeNode";
import { RemoveNode } from "../../../src/sim/commands/removeNode";
import { SetBoxConstruction } from "../../../src/sim/commands/setBoxConstruction";
import { EventQueue, type SimEventOf } from "../../../src/sim/events";
import { fail } from "../../../src/sim/result";
import {
  createGameState,
  type GameState,
} from "../../../src/sim/state/gameState";
import type { EdgeId, NodeId } from "../../../src/sim/state/ids";
import { createNode, nodeRect } from "../../../src/sim/state/nodes";
import {
  deposit,
  isStorage,
  store,
  storedItems,
  type StorageNode,
} from "../../../src/sim/state/stock";
import { tick } from "../../../src/sim/tick";

const CORE = 1 as NodeId;
/** A Box whose centre is 3 cells from the Furnace site below. */
const NEAR = 10 as NodeId;
/** A Box whose centre is about 13 cells from it, farther than the Core. */
const FAR = 11 as NodeId;

/**
 * The MVP map with the Core at (59, 59) holding `core`, and two Boxes: NEAR
 * at (52, 53) and FAR at (45, 45). A Furnace (10 stone) placed at (55, 53)
 * is nearest to NEAR, then the Core, then FAR.
 */
function setup(stored: {
  core?: ItemCounts;
  near?: ItemCounts;
  far?: ItemCounts;
}) {
  const state = createGameState(MVP_SCENARIO);
  fill(items(state, CORE), stored.core);
  for (const [id, x, y, contents] of [
    [NEAR, 52, 53, stored.near],
    [FAR, 45, 45, stored.far],
  ] as const) {
    const box = createNode(id, "box", x, y) as StorageNode;
    fill(box, contents);
    state.nodes.set(id, box);
  }
  const commands = new CommandQueue();
  const events = new EventQueue();
  const paid: SimEventOf<"ConstructionPaid">[] = [];
  events.on("ConstructionPaid", (e) => paid.push(e));
  const step = () => {
    tick(state, commands, events.emit);
    events.drain();
  };
  const run = (command: Command) => {
    const result = commands.dispatch(state, command);
    step();
    return result;
  };
  return { state, commands, paid, step, run };
}

/** Puts `counts` into `node`, which starts empty. */
function fill(node: StorageNode, counts: ItemCounts = {}) {
  node.items = [];
  for (const [item, count] of itemEntries(counts)) store(node, item, count);
}

function items(state: GameState, id: NodeId) {
  const node = state.nodes.get(id);
  if (!node || !isStorage(node)) throw new Error(`node ${id} stores nothing`);
  return node;
}

/**
 * Makes `from` a buffer: a storage node with an output edge. The edge leads
 * to no node, so nothing flows out.
 */
function addOutputEdge(state: GameState, from: NodeId) {
  state.edges.set(1 as EdgeId, {
    id: 1 as EdgeId,
    from,
    fromPort: 0,
    to: 99 as NodeId,
    toPort: 0,
    level: 1,
    path: [{ x: 0, y: 0 }],
    items: [],
  });
}

const furnace = () => new PlaceNode("furnace", 55, 53);
/** The first placed node's id: the Boxes were set with ids of their own. */
const PLACED = 2 as NodeId;

describe("the global stock", () => {
  it("sums every storage node at the end of the tick (FR68)", () => {
    const { state, step } = setup({
      core: { stone: 3, coal: 1 },
      near: { stone: 4 },
      far: { "iron-ore": 7 },
    });
    step();
    expect(state.stock).toEqual({ stone: 7, coal: 1, "iron-ore": 7 });
  });

  it("follows the payment within the same tick", () => {
    const { state, run } = setup({ core: { stone: 30 } });
    run(furnace());
    expect(state.stock).toEqual({ stone: 20 });
  });
});

describe("paying for construction (FR69, FR70)", () => {
  it("draws from the nearest storage first and spills to the next", () => {
    const { state, paid, run } = setup({
      core: { stone: 100 },
      near: { stone: 4 },
      far: { stone: 100 },
    });
    run(furnace());
    expect(storedItems(items(state, NEAR))).toEqual({});
    expect(storedItems(items(state, CORE))).toEqual({ stone: 94 });
    expect(storedItems(items(state, FAR))).toEqual({ stone: 100 });
    expect(paid).toEqual([
      {
        type: "ConstructionPaid",
        site: { x: 55, y: 53, w: 2, h: 2 },
        draws: [
          { storage: NEAR, item: "stone", count: 4 },
          { storage: CORE, item: "stone", count: 6 },
        ],
      },
    ]);
  });

  it("draws from warehouses before buffers, however near", () => {
    const { state, run } = setup({
      core: { stone: 3 },
      near: { stone: 100 },
      far: { stone: 100 },
    });
    addOutputEdge(state, NEAR);
    run(furnace());
    expect(storedItems(items(state, CORE))).toEqual({});
    expect(storedItems(items(state, FAR))).toEqual({ stone: 93 });
    expect(storedItems(items(state, NEAR))).toEqual({ stone: 100 });
  });

  it("falls back to buffers when the warehouses run out", () => {
    const { state, run } = setup({ core: { stone: 3 }, near: { stone: 100 } });
    addOutputEdge(state, NEAR);
    run(furnace());
    expect(storedItems(items(state, CORE))).toEqual({});
    expect(storedItems(items(state, NEAR))).toEqual({ stone: 93 });
  });

  it("refuses with no_stock when all storage together falls short", () => {
    const { state, run } = setup({
      core: { stone: 3 },
      near: { stone: 3 },
      far: { stone: 3, "iron-ore": 50 },
    });
    expect(run(furnace())).toEqual(fail("no_stock"));
    expect(state.nodes.size).toBe(3);
  });

  it("drops a queued placement that earlier ones in the tick made unaffordable", () => {
    const { state, commands, step } = setup({ core: { stone: 15 } });
    commands.dispatch(state, furnace());
    commands.dispatch(state, new PlaceNode("furnace", 45, 50));
    step();
    expect(state.nodes.size).toBe(4);
    expect(state.stock).toEqual({ stone: 5 });
  });
});

describe("Boxes kept out of construction (FR71)", () => {
  const keep = (state: GameState, id: NodeId, on = true) =>
    new SetBoxConstruction(id, on).apply(state);

  it("leaves a marked Box out of the payment, however near", () => {
    const { state, paid, run } = setup({
      core: { stone: 100 },
      near: { stone: 100 },
    });
    keep(state, NEAR);
    run(furnace());
    expect(storedItems(items(state, NEAR))).toEqual({ stone: 100 });
    expect(paid[0].draws).toEqual([
      { storage: CORE, item: "stone", count: 10 },
    ]);
  });

  it("refuses with no_stock when only marked Boxes hold enough", () => {
    const { state, run } = setup({ core: { stone: 3 }, near: { stone: 100 } });
    keep(state, NEAR);
    expect(run(furnace())).toEqual(fail("no_stock"));
    // It still counts in the global stock the HUD shows.
    expect(state.stock).toEqual({ stone: 103 });
  });

  it("puts no refund into a marked Box", () => {
    const { state, run } = setup({ core: { stone: 10 } });
    run(furnace());
    keep(state, NEAR);
    items(state, CORE).items = [];
    run(new RemoveNode(PLACED));
    expect(storedItems(items(state, NEAR))).toEqual({});
    expect(storedItems(items(state, CORE))).toEqual({ stone: 10 });
  });

  it("keeps the option on a removed Box brought back by undo", () => {
    const { state, commands, run, step } = setup({ core: { "iron-ore": 10 } });
    keep(state, NEAR);
    run(new RemoveNode(NEAR));
    commands.undo(state);
    step();
    expect(items(state, NEAR)).toMatchObject({ noConstruction: true });
  });

  it("is set by a command that only a Box accepts, and undoes", () => {
    const { state, commands, step } = setup({});
    expect(new SetBoxConstruction(CORE, true).validate(state)).toEqual(
      fail("not_found"),
    );
    commands.dispatch(state, new SetBoxConstruction(NEAR, true));
    step();
    expect(items(state, NEAR)).toMatchObject({ noConstruction: true });
    commands.undo(state);
    step();
    expect(items(state, NEAR)).toMatchObject({ noConstruction: false });
  });
});

describe("refunds (FR21)", () => {
  it("returns the whole cost on removal", () => {
    const { state, run } = setup({ core: { stone: 10 } });
    run(furnace());
    run(new RemoveNode(PLACED));
    expect(state.stock).toEqual({ stone: 10 });
  });

  it("returns the items inside a removed Box to the Core, and refunds the Box", () => {
    const { state, run } = setup({ near: { coal: 40 } });
    run(new RemoveNode(NEAR));
    expect(storedItems(items(state, CORE))).toMatchObject({ coal: 40 });
    expect(state.stock).toEqual({ "iron-ore": 10, coal: 40 });
  });

  it("brings an undone removal back with its items, paid for again", () => {
    const { state, commands, paid, run, step } = setup({ far: { coal: 40 } });
    run(new RemoveNode(FAR));
    commands.undo(state);
    step();
    expect(storedItems(items(state, FAR))).toEqual({ coal: 40 });
    expect(storedItems(items(state, CORE))).toEqual({});
    expect(state.stock).toEqual({ coal: 40 });
    expect(paid.at(-1)?.site).toEqual(nodeRect(items(state, FAR)));
  });

  it("cannot undo a removal once the Core has spent its items", () => {
    const { state, commands, run } = setup({ far: { coal: 40 } });
    run(new RemoveNode(FAR));
    // Spent outside the queue, so the undo stack still ends in the removal.
    items(state, CORE).items = [];
    store(items(state, NEAR), "coal", 40);
    expect(commands.undo(state)).toEqual(fail("no_stock"));
  });

  it("puts no refund into a Box that feeds a machine", () => {
    const { state, run } = setup({ core: { stone: 10 } });
    addOutputEdge(state, NEAR);
    run(furnace());
    run(new RemoveNode(PLACED));
    expect(storedItems(items(state, NEAR))).toEqual({});
    expect(storedItems(items(state, CORE))).toEqual({ stone: 10 });
  });

  it("cannot undo a removal once its refund is spent", () => {
    const { state, commands, run } = setup({ core: { stone: 10 } });
    run(furnace());
    run(new RemoveNode(PLACED));
    // Spent outside the queue, so the undo stack still ends in the removal.
    for (const id of [CORE, NEAR, FAR]) items(state, id).items = [];
    expect(commands.undo(state)).toEqual(fail("no_stock"));
  });

  it("fills a Box only up to its capacity, the rest going to the Core", () => {
    const { state } = setup({ core: { stone: 1995 }, near: { coal: 498 } });
    state.nodes.delete(FAR);
    const site = { x: 55, y: 53, w: 2, h: 2 };
    deposit(state, { "iron-ore": 10 }, site);
    expect(storedItems(items(state, NEAR))).toEqual({
      coal: 498,
      "iron-ore": 2,
    });
    expect(storedItems(items(state, CORE))).toEqual({
      stone: 1995,
      "iron-ore": 8,
    });
  });
});
