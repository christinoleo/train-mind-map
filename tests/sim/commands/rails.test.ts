import { describe, expect, it } from "vitest";
import type { NodeKind } from "../../../src/data/nodes";
import { MVP_CORRIDOR, MVP_SCENARIO } from "../../../src/data/scenarios/mvp";
import type { Command } from "../../../src/sim/commands/command";
import { CommandQueue } from "../../../src/sim/commands/commandQueue";
import { MoveNode } from "../../../src/sim/commands/moveNode";
import { PlaceNode } from "../../../src/sim/commands/placeNode";
import { PlaceRail } from "../../../src/sim/commands/placeRail";
import { RemoveNode } from "../../../src/sim/commands/removeNode";
import { RemoveRail } from "../../../src/sim/commands/removeRail";
import { EventQueue } from "../../../src/sim/events";
import { planRail, railCost, railLength } from "../../../src/sim/rail/rails";
import { railCells } from "../../../src/sim/rail/route";
import { fail, ok, type Result } from "../../../src/sim/result";
import {
  createGameState,
  type GameState,
} from "../../../src/sim/state/gameState";
import {
  allocateId,
  type NodeId,
  type RailId,
} from "../../../src/sim/state/ids";
import { cellIndex, Terrain } from "../../../src/sim/state/map";
import { createNode, railCrosses } from "../../../src/sim/state/nodes";
import { updateStock } from "../../../src/sim/systems/stock";
import { tick } from "../../../src/sim/tick";
import { fillCore } from "../support/stock";

// The MVP map: the Core at (59, 59), the water wall in columns 76–95 with
// the 1-cell corridor on row 60, and land again from column 96.
function setup(perItem = 100) {
  const state = createGameState(MVP_SCENARIO);
  fillCore(state, perItem);
  const commands = new CommandQueue();
  const events = new EventQueue();
  const run = (command: Command): Result => {
    const result = commands.dispatch(state, command);
    tick(state, commands, events.emit);
    events.drain();
    return result;
  };
  const undo = (): Result => {
    const result = commands.undo(state);
    tick(state, commands, events.emit);
    events.drain();
    return result;
  };
  /** Puts a node straight into the state, skipping placement rules. */
  const put = (kind: NodeKind, x: number, y: number): NodeId => {
    const id = allocateId(state.nextIds, "node");
    state.nodes.set(id, createNode(id, kind, x, y));
    updateStock(state);
    return id;
  };
  return { state, run, undo, put };
}

const LEFT = 0;
const RIGHT = 1;
const end = (node: NodeId, port: number) => ({ node, port });

function onlyRail(state: GameState) {
  expect(state.rails.size).toBe(1);
  return [...state.rails.values()][0];
}

/** A Station each side of the corridor, their rail ports on its row. */
function corridor(perItem?: number) {
  const s = setup(perItem);
  // A 2×2 Station's rail ports sit on its second row.
  const west = s.put("station", 70, MVP_CORRIDOR.y - 1);
  const east = s.put("station", 98, MVP_CORRIDOR.y - 1);
  return { ...s, west, east };
}

describe("PlaceRail (FR45, FR79–FR81)", () => {
  it("routes through the MVP corridor, paying 1 rail per cell", () => {
    const { state, run, west, east } = corridor();
    const before = state.stock.rail ?? 0;
    expect(run(new PlaceRail(end(west, RIGHT), end(east, LEFT)))).toEqual(ok());
    const rail = onlyRail(state);
    expect(rail.path).toEqual([
      { x: 72, y: 60 },
      { x: 97, y: 60 },
    ]);
    expect(railLength(rail.path)).toBe(26);
    expect(state.stock.rail).toBe(before - 26);
  });

  it("refuses when the stock lacks the rail items", () => {
    const { state, west, east } = corridor(10);
    expect(
      new PlaceRail(end(west, RIGHT), end(east, LEFT)).validate(state),
    ).toEqual(fail("no_stock"));
  });

  it("refuses a route sealed off by water", () => {
    const { state, west, east } = corridor();
    // Fill the corridor with water.
    const { map } = state;
    for (let x = MVP_CORRIDOR.x; x < MVP_CORRIDOR.x + MVP_CORRIDOR.w; x++) {
      map.terrain[cellIndex(x, MVP_CORRIDOR.y)] = Terrain.Water;
    }
    expect(
      new PlaceRail(end(west, RIGHT), end(east, LEFT)).validate(state),
    ).toEqual(fail("no_route"));
  });

  it("goes around nodes but never through them", () => {
    const { state, run, put } = setup();
    const a = put("station", 50, 50);
    const b = put("station", 60, 50);
    // A Box right on the straight line between the rail ports.
    put("box", 55, 50);
    expect(run(new PlaceRail(end(a, RIGHT), end(b, LEFT)))).toEqual(ok());
    const cells = railCells(onlyRail(state).path);
    for (const c of cells) {
      expect(c.x >= 55 && c.x <= 56 && c.y >= 50 && c.y <= 51).toBe(false);
    }
  });

  it("refuses a rail port already holding a rail", () => {
    const { state, run, put } = setup();
    const a = put("station", 50, 50);
    const b = put("station", 60, 50);
    const c = put("station", 60, 56);
    run(new PlaceRail(end(a, RIGHT), end(b, LEFT)));
    expect(new PlaceRail(end(a, RIGHT), end(c, LEFT)).validate(state)).toEqual(
      fail("connector_taken"),
    );
    expect(new PlaceRail(end(c, LEFT), end(b, LEFT)).validate(state)).toEqual(
      fail("connector_taken"),
    );
  });

  it("refuses a rail between the ports of one Station", () => {
    const { state, put } = setup();
    const a = put("station", 50, 50);
    expect(new PlaceRail(end(a, LEFT), end(a, RIGHT)).validate(state)).toEqual(
      fail("same_node"),
    );
  });

  it("refuses ends that are not Station rail ports", () => {
    const { state, put } = setup();
    const a = put("station", 50, 50);
    const box = put("box", 60, 50);
    expect(new PlaceRail(end(a, RIGHT), end(box, 0)).validate(state)).toEqual(
      fail("not_found"),
    );
    expect(new PlaceRail(end(a, 2), end(a, 0)).validate(state)).toEqual(
      fail("not_found"),
    );
  });

  it("refuses a rail port whose cell something occupies", () => {
    const { state, put } = setup();
    const a = put("station", 50, 50);
    const b = put("station", 60, 50);
    put("box", 58, 50);
    expect(new PlaceRail(end(a, RIGHT), end(b, LEFT)).validate(state)).toEqual(
      fail("crosses_node"),
    );
  });

  it("does not cross another rail (crossings come in Epic 7)", () => {
    const { state, run, put } = setup();
    const a = put("station", 50, 50);
    const b = put("station", 60, 50);
    run(new PlaceRail(end(a, RIGHT), end(b, LEFT)));
    const c = put("station", 55, 44);
    const d = put("station", 55, 56);
    const plan = planRail(state, end(c, LEFT), end(d, LEFT));
    if (plan.route) {
      const taken = new Set(
        railCells(onlyRail(state).path).map((p) => `${p.x},${p.y}`),
      );
      for (const p of railCells(plan.route.path)) {
        expect(taken.has(`${p.x},${p.y}`)).toBe(false);
      }
    } else {
      expect(plan.check).toEqual(fail("no_route"));
    }
  });

  it("passes over edges", () => {
    const { state, run, put } = setup();
    const a = put("station", 50, 50);
    const b = put("station", 60, 50);
    state.edges.set(1 as never, {
      id: 1 as never,
      from: a,
      fromPort: 0,
      to: b,
      toPort: 0,
      level: 1,
      path: [
        { x: 55, y: 45 },
        { x: 55, y: 55 },
      ],
      items: [],
    });
    expect(run(new PlaceRail(end(a, RIGHT), end(b, LEFT)))).toEqual(ok());
    expect(onlyRail(state).path).toEqual([
      { x: 52, y: 51 },
      { x: 59, y: 51 },
    ]);
  });

  it("undoes into a removal with a full refund", () => {
    const { state, run, undo, west, east } = corridor();
    const before = state.stock.rail;
    run(new PlaceRail(end(west, RIGHT), end(east, LEFT)));
    expect(undo()).toEqual(ok());
    expect(state.rails.size).toBe(0);
    expect(state.stock.rail).toBe(before);
  });
});

describe("RemoveRail", () => {
  it("removes a rail and refunds its cost; undo puts it back", () => {
    const { state, run, undo, west, east } = corridor();
    const before = state.stock.rail;
    run(new PlaceRail(end(west, RIGHT), end(east, LEFT)));
    const rail = onlyRail(state);
    expect(run(new RemoveRail(rail.id))).toEqual(ok());
    expect(state.rails.size).toBe(0);
    expect(state.stock.rail).toBe(before);
    expect(undo()).toEqual(ok());
    expect(onlyRail(state)).toEqual(rail);
    expect(state.stock.rail).toBe(before! - railCost(26).rail!);
  });

  it("refuses a missing rail", () => {
    const { state } = setup();
    expect(new RemoveRail(9 as RailId).validate(state)).toEqual(
      fail("not_found"),
    );
  });
});

describe("rails and nodes", () => {
  it("keeps nodes off rails", () => {
    const { state, run, west, east } = corridor();
    run(new PlaceRail(end(west, RIGHT), end(east, LEFT)));
    expect(new PlaceNode("box", 73, 60).validate(state)).toEqual(
      fail("crosses_rail"),
    );
  });

  it("removes a Station's rails with it, and its undo brings them back", () => {
    const { state, run, undo, west, east } = corridor();
    run(new PlaceRail(end(west, RIGHT), end(east, LEFT)));
    const rail = onlyRail(state);
    expect(run(new RemoveNode(west))).toEqual(ok());
    expect(state.rails.size).toBe(0);
    expect(undo()).toEqual(ok());
    expect(onlyRail(state)).toEqual(rail);
    expect(state.nodes.has(west)).toBe(true);
  });

  it("refuses to move a Station that has rails", () => {
    const { state, run, west, east } = corridor();
    run(new PlaceRail(end(west, RIGHT), end(east, LEFT)));
    expect(new MoveNode(west, 66, 50).validate(state)).toEqual(
      fail("has_rails"),
    );
  });

  it("keeps a passing rail off another Station's free rail port", () => {
    const { state, run, put } = setup();
    const top = put("station", 40, 40);
    const middle = put("station", 40, 45);
    const bottom = put("station", 40, 50);
    expect(run(new PlaceRail(end(top, LEFT), end(bottom, LEFT)))).toEqual(ok());
    const cells = railCells(onlyRail(state).path);
    expect(cells).not.toContainEqual({ x: 39, y: 46 });
    const west = put("station", 30, 45);
    expect(planRail(state, end(middle, LEFT), end(west, RIGHT)).check.ok).toBe(
      true,
    );
  });

  it("keeps nodes off the corners a diagonal rail cuts", () => {
    const { state, run, put } = setup();
    const a = put("station", 40, 40);
    const b = put("station", 50, 50);
    expect(run(new PlaceRail(end(a, RIGHT), end(b, LEFT)))).toEqual(ok());
    const cells = railCells(onlyRail(state).path);
    const i = cells.findIndex(
      (c, k) => k > 0 && c.x !== cells[k - 1].x && c.y !== cells[k - 1].y,
    );
    expect(i).toBeGreaterThan(0);
    const corner = { x: cells[i].x, y: cells[i - 1].y, w: 1, h: 1 };
    expect(cells).not.toContainEqual({ x: corner.x, y: corner.y });
    expect(railCrosses(state, corner)).toBe(true);
  });
});
