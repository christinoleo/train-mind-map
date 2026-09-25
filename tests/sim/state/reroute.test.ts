import { describe, expect, it } from "vitest";
import { itemEntries } from "../../../src/data/items";
import { MVP_SCENARIO } from "../../../src/data/scenarios/mvp";
import type { NodeKind } from "../../../src/data/nodes";
import type { Command } from "../../../src/sim/commands/command";
import { CommandQueue } from "../../../src/sim/commands/commandQueue";
import { ConnectEdge, planEdge } from "../../../src/sim/commands/connectEdge";
import { MoveNode, planMove } from "../../../src/sim/commands/moveNode";
import { EventQueue } from "../../../src/sim/events";
import { buildPlanarIndex, type Point } from "../../../src/sim/geometry/planar";
import { pathLength } from "../../../src/sim/geometry/route";
import type { Result } from "../../../src/sim/result";
import { cellIndex, MAP_RECT, Terrain } from "../../../src/sim/state/map";
import { edgeThroughput, edgeUnits } from "../../../src/sim/state/edges";
import {
  createGameState,
  type GameState,
} from "../../../src/sim/state/gameState";
import { allocateId, type NodeId } from "../../../src/sim/state/ids";
import { rerouted, slowedEdges } from "../../../src/sim/state/reroute";
import { createNode } from "../../../src/sim/state/nodes";
import { hashState } from "../../../src/sim/state/serialize";
import { isStorage, storedItems } from "../../../src/sim/state/stock";
import { updateStock } from "../../../src/sim/systems/stock";
import { tick } from "../../../src/sim/tick";
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
    const resource = kind === "extractor" ? "iron-ore" : undefined;
    state.nodes.set(id, createNode(id, kind, x, y, { resource }));
    updateStock(state);
    return id;
  };
  /** Puts an edge straight into the state along `path`, at level 3. */
  const wire = (from: NodeId, to: NodeId, toPort: number, path: Point[]) => {
    const id = allocateId(state.nextIds, "edge");
    state.edges.set(id, {
      id,
      from,
      fromPort: 0,
      to,
      toPort,
      level: 3,
      path,
      items: [],
    });
    return id;
  };
  return { state, run, undo, put, wire, rejected };
}

/**
 * The playtest case: two Extractors into one Box, the first edge on a long
 * detour that walls the second Extractor off from the Box's free input.
 * The Box's inputs sit at (55, 50) and (55, 51). Water on rows 46 and 59,
 * from the map's revealed edge to the detour, closes the pocket the second
 * Extractor sits in, so no route goes round the detour however long.
 */
function twoExtractors() {
  const s = setup();
  for (let x = 0; x <= 53; x++) {
    for (const y of [46, 59]) {
      s.state.map.terrain[cellIndex(x, y)] = Terrain.Water;
    }
  }
  const box = s.put("box", 56, 50);
  const first = s.put("extractor", 50, 47);
  const second = s.put("extractor", 50, 52);
  const detour = [
    { x: 52, y: 48 },
    { x: 53, y: 48 },
    { x: 53, y: 58 },
    { x: 54, y: 58 },
    { x: 54, y: 50 },
    { x: 55, y: 50 },
  ];
  const wall = s.wire(first, box, 0, detour);
  return { ...s, box, first, second, wall, detour };
}

const second = (s: ReturnType<typeof twoExtractors>) =>
  new ConnectEdge({ node: s.second, port: 0 }, { node: s.box, port: 1 });

/** Every edge of `state` keeps the planar rule against the others. */
function expectPlanar(state: GameState) {
  const index = buildPlanarIndex(state);
  for (const edge of state.edges.values()) {
    index.removeEdge(edge.id);
    expect(index.checkPath(edge.path)).toEqual({ ok: true, value: undefined });
    index.addEdge(edge.id, edge.path);
  }
}

/** Everything stored, in the Core and the Boxes together. */
function coreStock(state: GameState) {
  const total: Record<string, number> = {};
  for (const node of state.nodes.values()) {
    if (!isStorage(node)) continue;
    for (const [item, count] of Object.entries(storedItems(node))) {
      total[item] = (total[item] ?? 0) + count;
    }
  }
  return total;
}

describe("rip-up and re-route (FR52)", () => {
  it("moves the edge in the way so a second Extractor reaches the Box", () => {
    const s = twoExtractors();
    const index = buildPlanarIndex(s.state);
    const plan = planEdge(
      s.state,
      { node: s.second, port: 0 },
      { node: s.box, port: 1 },
      index,
    );
    expect(plan.check.ok).toBe(true);
    expect(plan.moved.map((m) => m.id)).toEqual([s.wall]);

    expect(s.run(second(s))).toEqual({ ok: true, value: undefined });
    expect(s.state.edges.size).toBe(2);
    const wall = s.state.edges.get(s.wall)!;
    expect(wall.path[0]).toEqual(s.detour[0]);
    expect(wall.path.at(-1)).toEqual(s.detour.at(-1));
    expect(pathLength(wall.path)).toBeLessThan(pathLength(s.detour));
    expectPlanar(s.state);
  });

  it("refunds the cells the moved edge loses", () => {
    const s = twoExtractors();
    const before = coreStock(s.state);
    const plan = planEdge(
      s.state,
      { node: s.second, port: 0 },
      { node: s.box, port: 1 },
    );
    expect(Object.keys(plan.refund).length).toBeGreaterThan(0);
    s.run(second(s));
    const after = coreStock(s.state);
    for (const [item, count] of itemEntries(plan.refund)) {
      const paid = plan.check.ok ? (plan.check.value[item] ?? 0) : 0;
      expect(after[item] ?? 0).toBe((before[item] ?? 0) + count - paid);
    }
  });

  it("keeps the moved edge's items in order, at the same share of the way", () => {
    const s = twoExtractors();
    const wall = s.state.edges.get(s.wall)!;
    const units = edgeUnits(wall);
    wall.items = [
      { item: "iron-ore", pos: units - 200, prevPos: units - 240 },
      { item: "iron-ore", pos: units / 2, prevPos: units / 2 - 40 },
      { item: "iron-ore", pos: 40, prevPos: 0 },
    ];
    const plan = planEdge(
      s.state,
      { node: s.second, port: 0 },
      { node: s.box, port: 1 },
    );
    const moved = rerouted(wall, plan.moved[0].path);
    const to = edgeUnits(moved);
    expect(moved.items).toEqual(
      wall.items.map(({ item, pos }) => {
        const at = Math.floor((pos * to) / units);
        return { item, pos: at, prevPos: at };
      }),
    );

    s.run(second(s));
    const items = s.state.edges.get(s.wall)!.items;
    expect(items).toHaveLength(3);
    for (let i = 1; i < items.length; i++) {
      expect(items[i].pos).toBeLessThan(items[i - 1].pos);
    }
  });

  it("undo puts the moved edge back on its old route", () => {
    const s = twoExtractors();
    const before = coreStock(s.state);
    s.run(second(s));
    expect(s.undo()).toEqual({ ok: true, value: undefined });
    expect(s.rejected).toEqual([]);
    expect(s.state.edges.size).toBe(1);
    expect(s.state.edges.get(s.wall)!.path).toEqual(s.detour);
    expect(coreStock(s.state)).toEqual(before);
  });

  it("refuses when no planar solution exists, and changes nothing", () => {
    // Two Extractors past the water wall feed the Core: the land corridor
    // is one cell wide, so only one edge fits through it.
    const s = setup();
    const core = 1 as NodeId;
    const high = s.put("extractor", 100, 57);
    const low = s.put("extractor", 100, 60);
    const through = planEdge(
      s.state,
      { node: high, port: 0 },
      { node: core, port: 0 },
    );
    s.wire(high, core, 0, through.route!.path);
    const edges = structuredClone([...s.state.edges.values()]);
    const stock = coreStock(s.state);
    const plan = planEdge(
      s.state,
      { node: low, port: 0 },
      { node: core, port: 1 },
    );
    expect(plan.check).toEqual({ ok: false, reason: "no_route" });
    expect(plan.moved).toEqual([]);
    const result = s.run(
      new ConnectEdge({ node: low, port: 0 }, { node: core, port: 1 }),
    );
    expect(result.ok).toBe(false);
    expect([...s.state.edges.values()]).toEqual(edges);
    expect(coreStock(s.state)).toEqual(stock);
  });

  it("is deterministic and leaves the planning index as it was", () => {
    const a = twoExtractors();
    const b = twoExtractors();
    const index = buildPlanarIndex(a.state);
    const blocked = index.blockedIn(MAP_RECT);
    const paths = index.edgeIds().map((id) => index.edgePath(id));
    const planned = planEdge(
      a.state,
      { node: a.second, port: 0 },
      { node: a.box, port: 1 },
      index,
    );
    expect(index.blockedIn(MAP_RECT)).toEqual(blocked);
    expect(index.edgeIds().map((id) => index.edgePath(id))).toEqual(paths);
    expect(
      planEdge(a.state, { node: a.second, port: 0 }, { node: a.box, port: 1 }),
    ).toEqual(planned);

    a.run(second(a));
    b.run(second(b));
    expect(hashState(a.state)).toBe(hashState(b.state));
  });

  it("moves edges in the way of a moving node's edges, and undo puts them back", () => {
    const s = twoExtractors();
    // A Furnace starts east of the wall, fed into the Box.
    s.state.nodes.delete(s.second);
    const mover = s.put("furnace", 58, 54);
    expect(
      s.run(
        new ConnectEdge({ node: mover, port: 0 }, { node: s.box, port: 1 }),
      ),
    ).toEqual({ ok: true, value: undefined });
    const own = [...s.state.edges.values()].find((e) => e.from === mover)!;
    const ownPath = own.path;

    const plan = planMove(s.state, mover, 50, 52);
    expect(plan.check.ok).toBe(true);
    expect(plan.moved.map((m) => m.id)).toEqual([s.wall]);
    expect(s.run(new MoveNode(mover, 50, 52))).toEqual({
      ok: true,
      value: undefined,
    });
    expect(s.state.edges.get(s.wall)!.path).not.toEqual(s.detour);
    expectPlanar(s.state);

    expect(s.undo()).toEqual({ ok: true, value: undefined });
    expect(s.rejected).toEqual([]);
    expect(s.state.edges.get(s.wall)!.path).toEqual(s.detour);
    expect(s.state.edges.get(own.id)!.path).toEqual(ownPath);
  });

  it("plans a rip-up in under 5 ms on the 96² map", () => {
    const s = twoExtractors();
    // A crowd of edges elsewhere, for the index to carry.
    for (let i = 0; i < 12; i++) {
      const from = s.put("extractor", 14 + (i % 4) * 8, 14 + ((i / 4) | 0) * 8);
      const to = s.put("box", 18 + (i % 4) * 8, 14 + ((i / 4) | 0) * 8);
      const built = s.run(
        new ConnectEdge({ node: from, port: 0 }, { node: to, port: 0 }),
      );
      expect(built.ok).toBe(true);
    }
    const from = { node: s.second, port: 0 };
    const to = { node: s.box, port: 1 };
    const index = buildPlanarIndex(s.state);
    for (let i = 0; i < 5; i++) planEdge(s.state, from, to, index);
    const times: number[] = [];
    for (let i = 0; i < 21; i++) {
      const start = performance.now();
      const plan = planEdge(s.state, from, to, index);
      times.push(performance.now() - start);
      expect(plan.moved).toHaveLength(1);
    }
    times.sort((x, y) => x - y);
    expect(times[10]).toBeLessThan(5);
  });
});

describe("slowedEdges (FR54)", () => {
  it("lists the moved edges whose new route crosses a distance step", () => {
    const { state, put, wire } = setup();
    const a = put("box", 40, 40);
    const b = put("box", 50, 40);
    const c = put("box", 40, 44);
    const d = put("box", 50, 44);
    // 10 cells each, at level 3.
    const short = wire(a, b, 0, [
      { x: 42, y: 40 },
      { x: 49, y: 40 },
    ]);
    const other = wire(c, d, 0, [
      { x: 42, y: 44 },
      { x: 49, y: 44 },
    ]);
    const slowed = slowedEdges(state, [
      // Grows to 13 cells: past the 12-cell step, so it halves.
      { id: short, length: 13 },
      // Grows to 11 cells: still under the step.
      { id: other, length: 11 },
    ]);
    const level3 = edgeThroughput(10, 3);
    expect(slowed).toEqual([{ id: short, from: level3, to: level3 / 2 }]);
  });

  it("leaves out an edge that found no route", () => {
    const { state, put, wire } = setup();
    const id = wire(put("box", 40, 40), put("box", 50, 40), 0, [
      { x: 42, y: 40 },
      { x: 49, y: 40 },
    ]);
    expect(slowedEdges(state, [{ id, length: null }])).toEqual([]);
  });
});
