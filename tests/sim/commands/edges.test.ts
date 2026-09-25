import { describe, expect, it } from "vitest";
import { MVP_SCENARIO } from "../../../src/data/scenarios/mvp";
import { NODE_KINDS, NODES, type NodeKind } from "../../../src/data/nodes";
import type { Command } from "../../../src/sim/commands/command";
import { CommandQueue } from "../../../src/sim/commands/commandQueue";
import { ConnectEdge, planEdge } from "../../../src/sim/commands/connectEdge";
import { PlaceNode } from "../../../src/sim/commands/placeNode";
import { RemoveEdge } from "../../../src/sim/commands/removeEdge";
import { RemoveNode } from "../../../src/sim/commands/removeNode";
import { UpgradeEdge } from "../../../src/sim/commands/upgradeEdge";
import { EventQueue } from "../../../src/sim/events";
import { fail, ok, type Result } from "../../../src/sim/result";
import { EDGE_MAX_LENGTH } from "../../../src/data/edges";
import {
  checkLength,
  connectorCell,
  connectorCount,
  connectorRows,
  edgeCost,
  edgeThroughput,
  lengthChangeCost,
  reservedCells,
  upgradeCost,
} from "../../../src/sim/state/edges";
import {
  createGameState,
  type GameState,
} from "../../../src/sim/state/gameState";
import {
  allocateId,
  type EdgeId,
  type NodeId,
} from "../../../src/sim/state/ids";
import { createNode } from "../../../src/sim/state/nodes";
import { updateStock } from "../../../src/sim/systems/stock";
import { isStorage, store } from "../../../src/sim/state/stock";
import { tick } from "../../../src/sim/tick";
import { railCells } from "../../../src/sim/rail/route";
import { fillCore } from "../support/stock";

// The MVP map: the Core at (58, 58), open land around (50, 50), the water
// wall from column 76 and cells 12–107 revealed on both axes.
function setup(perItem = 100) {
  const state = createGameState(MVP_SCENARIO);
  fillCore(state, perItem);
  const commands = new CommandQueue();
  const events = new EventQueue();
  const step = () => {
    tick(state, commands, events.emit);
    events.drain();
  };
  const run = (command: Command): Result => {
    const result = commands.dispatch(state, command);
    step();
    return result;
  };
  /** Puts a node straight into the state, skipping placement rules. */
  const put = (kind: NodeKind, x: number, y: number): NodeId => {
    const id = allocateId(state.nextIds, "node");
    const resource = kind === "extractor" ? "iron-ore" : undefined;
    state.nodes.set(id, createNode(id, kind, x, y, { resource }));
    updateStock(state);
    return id;
  };
  return { state, commands, step, run, put };
}

const out = (node: NodeId, port = 0) => ({ node, port });
const into = out;

/** Two Boxes four cells apart on one row: A's outputs face B's inputs. */
function twoBoxes(perItem?: number) {
  const s = setup(perItem);
  const a = s.put("box", 50, 50);
  const b = s.put("box", 56, 50);
  return { ...s, a, b };
}

function onlyEdge(state: GameState) {
  expect(state.edges.size).toBe(1);
  return [...state.edges.values()][0];
}

describe("connector layout", () => {
  it("keeps connectors in the body rows while they fit, one per row", () => {
    expect(connectorRows(1, 2)).toEqual([1]);
    expect(connectorRows(2, 3)).toEqual([1, 2]);
    expect(connectorRows(2, 2)).toEqual([0, 1]);
    expect(connectorRows(3, 3)).toEqual([0, 1, 2]);
  });

  it.each(NODE_KINDS)(
    "gives each of %s's connectors a cell of its own",
    (kind) => {
      const node = { kind, x: 50, y: 50 };
      for (const side of ["input", "output"] as const) {
        const cells = Array.from(
          { length: connectorCount(node, side) },
          (_, port) => connectorCell(node, side, port),
        ).map((c) => `${c.x},${c.y}`);
        expect(new Set(cells).size).toBe(cells.length);
      }
    },
  );

  it("puts outputs beside the right side and inputs beside the left", () => {
    const box = { kind: "box" as const, x: 50, y: 50 };
    expect(connectorCell(box, "output", 1)).toEqual({ x: 52, y: 51 });
    expect(connectorCell(box, "input", 0)).toEqual({ x: 49, y: 50 });
  });
});

describe("edge costs (FR44, FR58)", () => {
  it("charges per cell, each level adding an item", () => {
    expect(edgeCost(4, 1)).toEqual({ "iron-ore": 4 });
    expect(edgeCost(4, 3)).toEqual({ "iron-ore": 4, gear: 4, circuit: 4 });
  });

  it("charges an upgrade only the difference", () => {
    expect(upgradeCost(4, 1, 2)).toEqual({ gear: 4 });
    expect(upgradeCost(4, 1, 3)).toEqual({ gear: 4, circuit: 4 });
  });

  it("doubles the cost per cell every 12 cells (FR54)", () => {
    expect(edgeCost(12, 1)).toEqual({ "iron-ore": 12 });
    expect(edgeCost(13, 1)).toEqual({ "iron-ore": 14 });
    expect(edgeCost(24, 1)).toEqual({ "iron-ore": 36 });
    expect(edgeCost(30, 1)).toEqual({ "iron-ore": 12 + 24 + 6 * 4 });
    expect(upgradeCost(13, 1, 2)).toEqual({ gear: 14 });
  });

  it("charges a change of length the cells gained or lost, at their weight", () => {
    expect(lengthChangeCost(12, 14, 1)).toEqual({ "iron-ore": 4 });
    expect(lengthChangeCost(14, 12, 1)).toEqual({ "iron-ore": 4 });
    expect(lengthChangeCost(2, 4, 1)).toEqual({ "iron-ore": 2 });
  });
});

describe("edge length (FR54)", () => {
  it("allows 200 cells at every level and refuses more", () => {
    expect(checkLength(EDGE_MAX_LENGTH)).toEqual(ok());
    expect(checkLength(EDGE_MAX_LENGTH + 1)).toEqual(fail("out_of_range"));
  });

  it("halves the throughput every 12 cells", () => {
    expect(edgeThroughput(11, 1)).toBe(2);
    expect(edgeThroughput(12, 1)).toBe(1);
    expect(edgeThroughput(42, 1)).toBe(0.25);
    expect(edgeThroughput(42, 2)).toBe(0.5);
    expect(edgeThroughput(23, 3)).toBe(4);
  });
});

describe("ConnectEdge validation", () => {
  type Case = [string, (s: ReturnType<typeof twoBoxes>) => Command, Result];
  const cases: Case[] = [
    [
      "an output to an input",
      ({ a, b }) => new ConnectEdge(out(a), into(b)),
      ok(),
    ],
    [
      "a missing node",
      ({ a }) => new ConnectEdge(out(a), into(99 as NodeId)),
      fail("not_found"),
    ],
    [
      "an output the node lacks",
      ({ a, b }) => new ConnectEdge(out(a, 2), into(b)),
      fail("not_found"),
    ],
    [
      "an input on a node with none",
      ({ a, put }) => new ConnectEdge(out(a), into(put("extractor", 65, 58))),
      fail("not_found"),
    ],
    [
      "a node to itself",
      ({ a }) => new ConnectEdge(out(a), into(a)),
      fail("same_node"),
    ],
    [
      "an input with a node on its cell",
      ({ a, b, put }) => {
        put("box", 54, 49);
        return new ConnectEdge(out(a), into(b));
      },
      fail("crosses_node"),
    ],
    [
      "an output into the water",
      ({ b, put }) => new ConnectEdge(out(put("box", 74, 50)), into(b)),
      fail("on_water"),
    ],
    [
      "an output off the revealed area",
      ({ b, put }) => new ConnectEdge(out(put("box", 106, 50)), into(b)),
      fail("out_of_bounds"),
    ],
    [
      "an input 14 cells away",
      ({ a, put }) => new ConnectEdge(out(a), into(put("box", 66, 50))),
      ok(),
    ],
    [
      "an input sealed off by nodes",
      ({ a, b, put }) => {
        // Boxes seal B's input cells (55, 50) and (55, 51) off.
        put("box", 54, 48);
        put("box", 53, 50);
        put("box", 54, 52);
        return new ConnectEdge(out(a, 1), into(b));
      },
      fail("no_route"),
    ],
  ];

  for (const [name, make, expected] of cases) {
    it(`${expected.ok ? "accepts" : "refuses"} ${name}`, () => {
      const s = twoBoxes();
      expect(make(s).validate(s.state)).toEqual(expected);
    });
  }

  it("refuses an edge the stock cannot pay for", () => {
    const s = twoBoxes(3);
    expect(new ConnectEdge(out(s.a), into(s.b)).validate(s.state)).toEqual(
      fail("no_stock"),
    );
  });

  it("allows one edge per connector", () => {
    const { state, run, a, b } = twoBoxes();
    expect(run(new ConnectEdge(out(a), into(b)))).toEqual(ok());
    expect(new ConnectEdge(out(a), into(b, 1)).validate(state)).toEqual(
      fail("connector_taken"),
    );
    expect(new ConnectEdge(out(a, 1), into(b)).validate(state)).toEqual(
      fail("connector_taken"),
    );
  });

  it("refuses an end on another edge's cells", () => {
    const { state, a, b } = twoBoxes();
    // An edge down column 55, ending on B's input cell.
    const id = allocateId(state.nextIds, "edge");
    state.edges.set(id, {
      id,
      from: a,
      fromPort: 1,
      to: b,
      toPort: 1,
      level: 1,
      path: [
        { x: 55, y: 45 },
        { x: 55, y: 50 },
      ],
      items: [],
    });
    expect(new ConnectEdge(out(a), into(b)).validate(state)).toEqual(
      fail("crosses_edge"),
    );
  });

  it("prices a long route with its far cells doubled", () => {
    const { state, put } = setup();
    const a = put("box", 50, 50);
    const far = put("box", 66, 50);
    const plan = planEdge(state, out(a), into(far));
    expect(plan.route?.length).toBe(14);
    expect(plan.check).toEqual(ok({ "iron-ore": 16 }));
  });
});

describe("ConnectEdge", () => {
  it("builds the routed edge at level 1 and pays per cell", () => {
    const { state, run, a, b } = twoBoxes();
    run(new ConnectEdge(out(a), into(b)));
    const edge = onlyEdge(state);
    expect(edge).toMatchObject({ from: a, fromPort: 0, to: b, toPort: 0 });
    expect(edge.level).toBe(1);
    expect(edge.path).toEqual([
      { x: 52, y: 50 },
      { x: 55, y: 50 },
    ]);
    expect(state.stock["iron-ore"]).toBe(100 - 4);
  });

  it("bends around a node in the way", () => {
    const { state, run, put } = setup();
    const a = put("box", 50, 50);
    const b = put("box", 60, 50);
    put("box", 54, 50);
    run(new ConnectEdge(out(a, 1), into(b, 1)));
    const { path } = onlyEdge(state);
    expect(path[0]).toEqual({ x: 52, y: 51 });
    expect(path.at(-1)).toEqual({ x: 59, y: 51 });
    expect(path.length).toBeGreaterThan(2);
  });

  it("is undone by removing the edge, refunded", () => {
    const { state, commands, run, step, a, b } = twoBoxes();
    run(new ConnectEdge(out(a), into(b)));
    commands.undo(state);
    step();
    expect(state.edges.size).toBe(0);
    expect(state.stock["iron-ore"]).toBe(100);
  });
});

describe("reserved connector cells (FR52)", () => {
  // Box A below-left of Box B: the shortest route from A's first output to
  // B's first input would run up past B's second input.
  function belowLeft() {
    const s = setup();
    const a = s.put("box", 50, 53);
    const b = s.put("box", 56, 50);
    return { ...s, a, b };
  }

  it("keeps a route off the cell in front of another free input", () => {
    const { state, run, a, b, put } = belowLeft();
    expect(run(new ConnectEdge(out(a), into(b)))).toEqual(ok());
    const { path } = onlyEdge(state);
    expect(railCells(path)).not.toContainEqual({ x: 55, y: 51 });
    // The second input is still reachable.
    const c = put("box", 50, 57);
    expect(run(new ConnectEdge(out(c), into(b, 1)))).toEqual(ok());
    expect(state.edges.size).toBe(2);
  });

  it("releases a connector's cell once an edge uses it", () => {
    const { state, run, a, b } = belowLeft();
    const cell = connectorCell(state.nodes.get(b)!, "input", 1);
    expect(reservedCells(state)).toContainEqual(cell);
    run(new ConnectEdge(out(a, 1), into(b, 1)));
    expect(reservedCells(state)).not.toContainEqual(cell);
  });

  it("joins nodes packed side by side, connector to facing connector", () => {
    const { state, run, put } = setup();
    const a = put("box", 50, 50);
    const b = put("box", 53, 50);
    expect(run(new ConnectEdge(out(a, 0), into(b, 0)))).toEqual(ok());
    expect(run(new ConnectEdge(out(a, 1), into(b, 1)))).toEqual(ok());
    const paths = [...state.edges.values()].map((e) => e.path);
    expect(paths).toEqual([[{ x: 52, y: 50 }], [{ x: 52, y: 51 }]]);
  });

  it("plans the same route every time", () => {
    const { state, a, b } = belowLeft();
    const first = planEdge(state, out(a), into(b));
    expect(first.check.ok).toBe(true);
    expect(planEdge(state, out(a), into(b))).toEqual(first);
  });
});

describe("nodes and edges", () => {
  it("refuses a node on an edge's cells", () => {
    const { state, run, a, b } = twoBoxes();
    run(new ConnectEdge(out(a), into(b)));
    expect(new PlaceNode("box", 53, 49).validate(state)).toEqual(
      fail("crosses_edge"),
    );
  });

  it("removes a node's edges with it, and its undo restores them", () => {
    const { state, commands, run, step, a, b } = twoBoxes();
    run(new ConnectEdge(out(a), into(b)));
    const edge = onlyEdge(state);
    run(new RemoveNode(b));
    expect(state.edges.size).toBe(0);
    commands.undo(state);
    step();
    expect(onlyEdge(state)).toEqual(edge);
    expect(state.nodes.has(b)).toBe(true);
  });
  it("keeps an edge's refund out of the storage node being removed", () => {
    const { state, commands, run, step, a, b } = twoBoxes();
    run(new ConnectEdge(out(a), into(b)));
    const before = { ...state.stock };
    // A, the nearest storage to the edge with the lower id, would take it.
    run(new RemoveNode(a));
    const boxOre = NODES.box.cost["iron-ore"] ?? 0;
    expect(state.stock["iron-ore"]).toBe(before["iron-ore"]! + 4 + boxOre);
    commands.undo(state);
    step();
    expect(state.stock).toEqual(before);
  });
});

describe("RemoveEdge (FR59)", () => {
  it("refunds the whole cost, and its undo pays it again", () => {
    const { state, commands, run, step, a, b } = twoBoxes();
    run(new ConnectEdge(out(a), into(b)));
    const edge = onlyEdge(state);
    run(new RemoveEdge(edge.id));
    expect(state.edges.size).toBe(0);
    expect(state.stock["iron-ore"]).toBe(100);
    commands.undo(state);
    step();
    expect(onlyEdge(state)).toEqual(edge);
    expect(state.stock["iron-ore"]).toBe(96);
  });

  it("refuses a missing edge", () => {
    const { state } = setup();
    expect(new RemoveEdge(1 as EdgeId).validate(state)).toEqual(
      fail("not_found"),
    );
  });

  it("refunds an upgraded edge at its level", () => {
    const { state, run, a, b } = twoBoxes();
    state.edgeLevel = 2;
    run(new ConnectEdge(out(a), into(b)));
    const { id } = onlyEdge(state);
    run(new UpgradeEdge(id, 2));
    run(new RemoveEdge(id));
    expect(state.stock).toMatchObject({ "iron-ore": 100, gear: 100 });
  });
});

describe("UpgradeEdge (FR58)", () => {
  function connected() {
    const s = twoBoxes();
    s.run(new ConnectEdge(out(s.a), into(s.b)));
    return { ...s, id: onlyEdge(s.state).id };
  }

  it("is gated by research", () => {
    const { state, id } = connected();
    expect(new UpgradeEdge(id, 2).validate(state)).toEqual(fail("locked"));
    state.edgeLevel = 2;
    expect(new UpgradeEdge(id, 2).validate(state)).toEqual(ok());
    expect(new UpgradeEdge(id, 3).validate(state)).toEqual(fail("locked"));
  });

  it("refuses a level the edge already has", () => {
    const { state, id } = connected();
    expect(new UpgradeEdge(id, 1).validate(state)).toEqual(fail("max_level"));
  });

  it("refuses an upgrade the stock cannot pay for", () => {
    const { state, id } = connected();
    state.edgeLevel = 3;
    const core = state.nodes.get(1 as NodeId)!;
    if (isStorage(core)) {
      core.items = core.items.filter((run) => run.item !== "circuit");
      store(core, "circuit", 3);
    }
    expect(new UpgradeEdge(id, 3).validate(state)).toEqual(fail("no_stock"));
  });

  it("pays the difference in place, and its undo refunds it", () => {
    const { state, commands, run, step, id } = connected();
    state.edgeLevel = 2;
    run(new UpgradeEdge(id, 2));
    expect(state.edges.get(id)?.level).toBe(2);
    expect(state.stock).toMatchObject({ "iron-ore": 96, gear: 96 });
    commands.undo(state);
    step();
    expect(state.edges.get(id)?.level).toBe(1);
    expect(state.stock).toMatchObject({ "iron-ore": 96, gear: 100 });
  });
});
