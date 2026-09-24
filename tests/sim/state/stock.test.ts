import { describe, expect, it } from "vitest";
import type { ItemCounts } from "../../../src/data/items";
import { MVP_SCENARIO } from "../../../src/data/scenarios/mvp";
import type { Command } from "../../../src/sim/commands/command";
import { CommandQueue } from "../../../src/sim/commands/commandQueue";
import { PlaceNode } from "../../../src/sim/commands/placeNode";
import { RemoveNode } from "../../../src/sim/commands/removeNode";
import { EventQueue, type SimEventOf } from "../../../src/sim/events";
import { fail } from "../../../src/sim/result";
import {
  createGameState,
  type GameState,
} from "../../../src/sim/state/gameState";
import type { EdgeId, NodeId } from "../../../src/sim/state/ids";
import { deposit, isStorage } from "../../../src/sim/state/stock";
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
  items(state, CORE).items = { ...stored.core };
  for (const [id, x, y, contents] of [
    [NEAR, 52, 53, stored.near],
    [FAR, 45, 45, stored.far],
  ] as const) {
    state.nodes.set(id, { id, kind: "box", x, y, items: { ...contents } });
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

function items(state: GameState, id: NodeId) {
  const node = state.nodes.get(id);
  if (!node || !isStorage(node)) throw new Error(`node ${id} stores nothing`);
  return node;
}

/** Makes `from` a buffer: a storage node with an output edge. */
function addOutputEdge(state: GameState, from: NodeId, to: NodeId) {
  state.edges.set(1 as EdgeId, { id: 1 as EdgeId, from, to });
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
    expect(items(state, NEAR).items).toEqual({});
    expect(items(state, CORE).items).toEqual({ stone: 94 });
    expect(items(state, FAR).items).toEqual({ stone: 100 });
    expect(paid).toEqual([
      {
        type: "ConstructionPaid",
        site: PLACED,
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
    addOutputEdge(state, NEAR, FAR);
    run(furnace());
    expect(items(state, CORE).items).toEqual({});
    expect(items(state, FAR).items).toEqual({ stone: 93 });
    expect(items(state, NEAR).items).toEqual({ stone: 100 });
  });

  it("falls back to buffers when the warehouses run out", () => {
    const { state, run } = setup({ core: { stone: 3 }, near: { stone: 100 } });
    addOutputEdge(state, NEAR, FAR);
    run(furnace());
    expect(items(state, CORE).items).toEqual({});
    expect(items(state, NEAR).items).toEqual({ stone: 93 });
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

describe("refunds (FR21)", () => {
  it("returns the whole cost on removal", () => {
    const { state, run } = setup({ core: { stone: 10 } });
    run(furnace());
    run(new RemoveNode(PLACED));
    expect(state.stock).toEqual({ stone: 10 });
  });

  it("loses the items inside a removed Box, and refunds the Box", () => {
    const { state, run } = setup({ near: { coal: 40 } });
    run(new RemoveNode(NEAR));
    expect(state.stock).toEqual({ "iron-ore": 10 });
  });

  it("brings an undone removal back empty, paid for again", () => {
    const { state, commands, paid, run, step } = setup({ far: { coal: 40 } });
    run(new RemoveNode(FAR));
    commands.undo(state);
    step();
    expect(items(state, FAR).items).toEqual({});
    expect(state.stock).toEqual({});
    expect(paid.at(-1)?.site).toBe(FAR);
  });

  it("cannot undo a removal once its refund is spent", () => {
    const { state, commands, run } = setup({ core: { stone: 10 } });
    run(furnace());
    run(new RemoveNode(PLACED));
    // Spent outside the queue, so the undo stack still ends in the removal.
    for (const id of [CORE, NEAR, FAR]) items(state, id).items = {};
    expect(commands.undo(state)).toEqual(fail("no_stock"));
  });

  it("fills storage only up to its capacity, losing the rest", () => {
    const { state } = setup({ core: { stone: 1995 }, near: { coal: 498 } });
    state.nodes.delete(FAR);
    const site = { x: 55, y: 53, w: 2, h: 2 };
    deposit(state, { "iron-ore": 10 }, site);
    expect(items(state, NEAR).items).toEqual({ coal: 498, "iron-ore": 2 });
    expect(items(state, CORE).items).toEqual({ stone: 1995, "iron-ore": 5 });
  });
});
