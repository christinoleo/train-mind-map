import { describe, expect, it } from "vitest";
import { FLOW_UNITS_PER_CELL } from "../../../src/config/constants";
import { MVP_SCENARIO } from "../../../src/data/scenarios/mvp";
import type { NodeKind } from "../../../src/data/nodes";
import type { Command } from "../../../src/sim/commands/command";
import { CommandQueue } from "../../../src/sim/commands/commandQueue";
import { ConnectEdge } from "../../../src/sim/commands/connectEdge";
import { MoveNode, planMove } from "../../../src/sim/commands/moveNode";
import { PlaceNode } from "../../../src/sim/commands/placeNode";
import { RemoveNode } from "../../../src/sim/commands/removeNode";
import { SetRecipe } from "../../../src/sim/commands/setRecipe";
import { UpgradeNode } from "../../../src/sim/commands/upgradeNode";
import { EventQueue } from "../../../src/sim/events";
import { fail, ok, type Result } from "../../../src/sim/result";
import {
  createGameState,
  type GameState,
} from "../../../src/sim/state/gameState";
import { allocateId, type NodeId } from "../../../src/sim/state/ids";
import { createNode } from "../../../src/sim/state/nodes";
import { updateStock } from "../../../src/sim/systems/stock";
import { tick } from "../../../src/sim/tick";
import { railCells } from "../../../src/sim/rail/route";
import { fillCore } from "../support/stock";

// The MVP map: the Core at (58, 58) and open land around (50, 50).
function setup() {
  const state = createGameState(MVP_SCENARIO);
  fillCore(state);
  const commands = new CommandQueue();
  const events = new EventQueue();
  const rejected: string[] = [];
  events.on("CommandRejected", ({ command, reason }) =>
    rejected.push(`${command}:${reason}`),
  );
  const step = () => {
    tick(state, commands, events.emit);
    events.drain();
  };
  const run = (command: Command): Result => {
    const result = commands.dispatch(state, command);
    step();
    return result;
  };
  const undo = (): Result => {
    const result = commands.undo(state);
    step();
    return result;
  };
  /** Puts a node straight into the state, skipping placement rules. */
  const put = (kind: NodeKind, x: number, y: number): NodeId => {
    const id = allocateId(state.nextIds, "node");
    state.nodes.set(id, createNode(id, kind, x, y));
    updateStock(state);
    return id;
  };
  return { state, commands, step, run, undo, put, rejected };
}

/** Two Boxes on one row, A's first output joined to B's first input. */
function joined() {
  const s = setup();
  const a = s.put("box", 50, 50);
  const b = s.put("box", 56, 50);
  expect(
    s.run(new ConnectEdge({ node: a, port: 0 }, { node: b, port: 0 })),
  ).toEqual(ok());
  const edge = onlyEdge(s.state);
  return { ...s, a, b, edge };
}

function onlyEdge(state: GameState) {
  expect(state.edges.size).toBe(1);
  return [...state.edges.values()][0];
}

const ore = (state: GameState) => state.stock["iron-ore"] ?? 0;

describe("MoveNode (FR20)", () => {
  it("moves the node and re-routes its edges, paying for new cells", () => {
    const { state, run, b, edge } = joined();
    expect(edge.path).toEqual([
      { x: 52, y: 50 },
      { x: 55, y: 50 },
    ]);
    const before = ore(state);

    expect(run(new MoveNode(b, 58, 52))).toEqual(ok());

    expect(state.nodes.get(b)).toMatchObject({ x: 58, y: 52 });
    const moved = onlyEdge(state);
    expect(moved.id).toBe(edge.id);
    expect(moved.path[0]).toEqual({ x: 52, y: 50 });
    expect(moved.path.at(-1)).toEqual({ x: 57, y: 52 });
    // 4 cells became 8: four more at 1 iron ore each.
    expect(ore(state)).toBe(before - 4);
  });

  it("refunds the cells a shorter edge gives up", () => {
    const { state, run, b } = joined();
    const before = ore(state);
    expect(run(new MoveNode(b, 55, 50))).toEqual(ok());
    expect(onlyEdge(state).path).toEqual([
      { x: 52, y: 50 },
      { x: 54, y: 50 },
    ]);
    expect(ore(state)).toBe(before + 1);
  });

  it("may overlap its own old cells and edges", () => {
    const { run, a } = joined();
    expect(run(new MoveNode(a, 51, 50))).toEqual(ok());
  });

  it("charges the cells a move adds at their distance weight (FR54)", () => {
    const { state, b } = joined();
    const plan = planMove(state, b, 70, 50);
    expect(plan.edges[0].length).toBe(18);
    // Cells 5–12 cost 1 each and cells 13–18 cost 2 each.
    expect(plan.check).toEqual(ok({ pay: { "iron-ore": 20 }, refund: {} }));
  });

  it("refuses cells another node or edge holds", () => {
    const { run, put, a, b } = joined();
    put("box", 56, 54);
    expect(run(new MoveNode(b, 56, 53))).toEqual(fail("occupied"));
    // The edge runs along row 50, so another node cannot sit on it.
    const c = put("box", 50, 56);
    expect(run(new MoveNode(c, 53, 49))).toEqual(fail("crosses_edge"));
    expect(run(new MoveNode(a, 11, 50))).toEqual(fail("out_of_bounds"));
  });

  it("refuses an edge left with no route", () => {
    const { state, run, put, b } = joined();
    // Past the water wall only the corridor on row 60 leads; a Box at its
    // mouth seals it.
    put("box", 74, 60);
    expect(planMove(state, b, 97, 50).check).toEqual(fail("no_route"));
    expect(run(new MoveNode(b, 97, 50))).toEqual(fail("no_route"));
  });

  it("re-routes clear of the moved node's own free connectors (FR52)", () => {
    const { state, run, b, edge } = joined();
    // From below, the fewest-bends route into B's first input would run up
    // column 55, past its second input at (55, 46).
    expect(run(new MoveNode(b, 56, 45))).toEqual(ok());
    const { path } = state.edges.get(edge.id)!;
    expect(path.at(-1)).toEqual({ x: 55, y: 45 });
    expect(railCells(path)).not.toContainEqual({ x: 55, y: 46 });
  });

  it("refuses to move the Core", () => {
    const { run } = setup();
    expect(run(new MoveNode(1 as NodeId, 40, 40))).toEqual(fail("immovable"));
  });

  it("drops items past the end of a shortened edge", () => {
    const { state, b, edge } = joined();
    state.edges.get(edge.id)!.items = [
      { item: "iron-ore", pos: 4 * FLOW_UNITS_PER_CELL, prevPos: 70 },
      { item: "iron-ore", pos: 0, prevPos: 0 },
    ];
    // The flow system would move them on; the move applies first.
    const moved = new MoveNode(b, 55, 50);
    expect(moved.validate(state)).toEqual(ok());
    moved.apply(state, () => {});
    expect(state.edges.get(edge.id)!.items).toEqual([
      { item: "iron-ore", pos: 0, prevPos: 0 },
    ]);
  });
});

describe("moving an Extractor (FR30)", () => {
  /** An Extractor wholly on the iron deposit, with an item finished. */
  function extractor() {
    const s = setup();
    expect(s.run(new PlaceNode("extractor", 65, 58))).toEqual(ok());
    const id = 2 as NodeId;
    const node = () => {
      const found = s.state.nodes.get(id);
      if (found?.kind !== "extractor") throw new Error("no Extractor");
      return found;
    };
    node().production.output = 1;
    return { ...s, id, node };
  }

  it("keeps its buffers over the same resource, at the new speed", () => {
    const { run, id, node } = extractor();
    expect(run(new MoveNode(id, 64, 58))).toEqual(ok());
    expect(node().coverage).toEqual([{ resource: "iron-ore", cells: 2 }]);
    expect(node().production.output).toBe(1);
  });

  it("keeps the share of the batch done, not its ticks", () => {
    const { run, id, node } = extractor();
    expect(run(new MoveNode(id, 64, 58))).toEqual(ok());
    // 2 of 4 cells: 40 ticks an item. Half done, then moved back onto 4.
    node().production.progress = 20;
    node().production.output = 0;
    expect(run(new MoveNode(id, 65, 58))).toEqual(ok());
    // The move's tick worked 1 of the 20 ticks an item takes now.
    expect(node().production.progress).toBeCloseTo(11);
    expect(node().production.output).toBe(0);
  });

  it("starts over on another resource", () => {
    const { run, id, node } = extractor();
    expect(run(new MoveNode(id, 51, 59))).toEqual(ok());
    expect(node().coverage).toEqual([{ resource: "stone", cells: 4 }]);
    expect(node().production.output).toBe(0);
  });

  it("refuses cells with no deposit under any of them", () => {
    const { run, id } = extractor();
    expect(run(new MoveNode(id, 45, 45))).toEqual(fail("needs_deposit"));
  });
});

describe("undo (FR137)", () => {
  it("undoes a placement", () => {
    const { state, run, undo } = setup();
    const before = ore(state);
    expect(run(new PlaceNode("box", 50, 50))).toEqual(ok());
    expect(state.nodes.size).toBe(2);
    expect(undo()).toEqual(ok());
    expect(state.nodes.size).toBe(1);
    expect(ore(state)).toBe(before);
  });

  it("undoes a connection", () => {
    const { state, undo } = joined();
    const before = ore(state);
    expect(undo()).toEqual(ok());
    expect(state.edges.size).toBe(0);
    expect(ore(state)).toBe(before + 4);
  });

  it("undoes a move onto the old routes, refunding what it paid", () => {
    const { state, run, undo, b, edge } = joined();
    const before = ore(state);
    run(new MoveNode(b, 58, 52));
    expect(undo()).toEqual(ok());
    expect(state.nodes.get(b)).toMatchObject({ x: 56, y: 50 });
    expect(onlyEdge(state).path).toEqual(edge.path);
    expect(ore(state)).toBe(before);
  });

  it("refuses to undo a move once its old cells are taken, with the reason", () => {
    const { state, run, undo, put, b, commands, rejected } = joined();
    run(new MoveNode(b, 58, 52));
    put("box", 56, 49);
    expect(undo()).toEqual(fail("occupied"));
    expect(state.nodes.get(b)).toMatchObject({ x: 58, y: 52 });
    expect(commands.undoDepth).toBe(2);
    expect(rejected).toEqual([]);
  });

  it("undoes a removal, bringing its edges back", () => {
    const { state, run, undo, b, edge } = joined();
    const before = ore(state);
    run(new RemoveNode(b));
    expect(state.edges.size).toBe(0);
    expect(undo()).toEqual(ok());
    expect(state.nodes.get(b)).toMatchObject({ x: 56, y: 50 });
    expect(onlyEdge(state).path).toEqual(edge.path);
    expect(ore(state)).toBe(before);
  });
});

describe("UpgradeNode (FR22)", () => {
  it("waits for research to unlock the next level", () => {
    const { run, put } = setup();
    const id = put("assembler-1", 45, 45);
    expect(run(new UpgradeNode(id))).toEqual(fail("locked"));
  });

  it("upgrades in place, paying the difference, and undoes", () => {
    const { state, run, undo, put } = setup();
    state.unlockedNodes.push("assembler-2");
    const id = put("assembler-1", 45, 45);
    const plates = state.stock["iron-plate"]!;
    expect(run(new UpgradeNode(id))).toEqual(ok());
    expect(state.nodes.get(id)).toMatchObject({ kind: "assembler-2", x: 45 });
    expect(state.stock["iron-plate"]).toBe(plates - 20);
    expect(state.stock.gear).toBe(90);
    expect(state.stock["copper-plate"]).toBe(100);

    expect(run(new UpgradeNode(id))).toEqual(fail("max_level"));
    expect(undo()).toEqual(ok());
    expect(state.nodes.get(id)).toMatchObject({ kind: "assembler-1" });
    expect(state.stock["iron-plate"]).toBe(plates);
    expect(state.stock.gear).toBe(100);
  });

  it("has no upgrade for kinds without a next level", () => {
    const { run, put } = setup();
    expect(run(new UpgradeNode(put("box", 45, 45)))).toEqual(fail("max_level"));
  });
});

describe("SetRecipe (FR27)", () => {
  it("undoes an Assembler's first recipe back to none", () => {
    const { state, run, undo, put } = setup();
    const id = put("assembler-1", 45, 45);
    run(new SetRecipe(id, "gear"));
    expect(undo()).toEqual(ok());
    expect(state.nodes.get(id)).toMatchObject({ recipe: null });
  });

  it("changes the recipe, losing the items inside, and undoes", () => {
    const { state, run, undo, put } = setup();
    const id = put("furnace", 45, 45);
    run(new SetRecipe(id, "iron-plate"));
    const node = state.nodes.get(id);
    if (node?.kind !== "furnace") throw new Error("no Furnace");
    node.production.input["iron-ore"] = 3;

    expect(run(new SetRecipe(id, "brick"))).toEqual(ok());
    expect(state.nodes.get(id)).toMatchObject({
      recipe: "brick",
      production: { input: {}, output: 0, progress: null },
    });
    expect(undo()).toEqual(ok());
    expect(state.nodes.get(id)).toMatchObject({ recipe: "iron-plate" });
  });

  it("takes only recipes the node can run", () => {
    const { run, put } = setup();
    const furnace = put("furnace", 45, 45);
    const assembler = put("assembler-1", 40, 40);
    expect(run(new SetRecipe(furnace, "gear"))).toEqual(fail("wrong_recipe"));
    expect(run(new SetRecipe(furnace, null))).toEqual(ok());
    expect(run(new SetRecipe(assembler, "gear"))).toEqual(ok());
    expect(run(new SetRecipe(assembler, null))).toEqual(ok());
    expect(run(new SetRecipe(put("box", 50, 50), "gear"))).toEqual(
      fail("not_found"),
    );
  });
});
