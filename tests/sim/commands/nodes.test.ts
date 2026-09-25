import { describe, expect, it } from "vitest";
import { MVP_SCENARIO } from "../../../src/data/scenarios/mvp";
import { NODE_KINDS, NODES, STARTING_NODES } from "../../../src/data/nodes";
import type { Command } from "../../../src/sim/commands/command";
import { CommandQueue } from "../../../src/sim/commands/commandQueue";
import { PlaceNode } from "../../../src/sim/commands/placeNode";
import { RemoveNode } from "../../../src/sim/commands/removeNode";
import { EventQueue, type SimEvent } from "../../../src/sim/events";
import { fail, ok } from "../../../src/sim/result";
import {
  createGameState,
  type ProducerNode,
} from "../../../src/sim/state/gameState";
import type { NodeId } from "../../../src/sim/state/ids";
import {
  deserializeState,
  hashState,
  serializeState,
} from "../../../src/sim/state/serialize";
import { coreNode, storedItems } from "../../../src/sim/state/stock";
import { tick } from "../../../src/sim/tick";
import { fillCore } from "../support/stock";
import { createNode } from "../../../src/sim/state/nodes";

// The MVP map: the Core at (59, 59), iron ore at (65, 58) 5×5, the water wall
// in columns 76–95, and cells 12–107 revealed on both axes.
function setup() {
  const state = createGameState(MVP_SCENARIO);
  fillCore(state);
  const commands = new CommandQueue();
  const events = new EventQueue();
  const seen: SimEvent[] = [];
  events.on("CommandRejected", (e) => seen.push(e));
  const step = () => {
    tick(state, commands, events.emit);
    events.drain();
  };
  const run = (command: Command) => {
    const result = commands.dispatch(state, command);
    step();
    return result;
  };
  return { state, commands, seen, step, run };
}

const CORE_ID = 1 as NodeId;

describe("node catalog", () => {
  it("keeps every footprint between 2×2 and 3×3", () => {
    for (const kind of NODE_KINDS) {
      expect([2, 3]).toContain(NODES[kind].size);
    }
  });

  it("unlocks the GDD's starting kinds without research (FR18)", () => {
    expect([...STARTING_NODES].sort()).toEqual(
      ["assembler-1", "box", "extractor", "furnace", "generator", "lab"].sort(),
    );
  });

  it("sizes the Core like the map's Core", () => {
    const { map } = createGameState(MVP_SCENARIO);
    expect(map.core.w).toBe(NODES.core.size);
    expect(map.core.h).toBe(NODES.core.size);
  });
});

describe("the starting state", () => {
  it("holds the Core as node 1, empty, on the map's Core cells", () => {
    const state = createGameState(MVP_SCENARIO);
    expect([...state.nodes.values()]).toEqual([
      { id: CORE_ID, kind: "core", x: 59, y: 59, items: [] },
    ]);
    expect(state.stock).toEqual({});
  });
});

describe("PlaceNode validation", () => {
  const cases: [string, PlaceNode, ReturnType<typeof ok>][] = [
    ["a Furnace on open land", new PlaceNode("furnace", 55, 53), ok()],
    ["a Box right beside the Core", new PlaceNode("box", 62, 59), ok()],
    ["an Extractor on a deposit", new PlaceNode("extractor", 65, 58), ok()],
    [
      "an Extractor off any deposit",
      new PlaceNode("extractor", 45, 45),
      fail("needs_deposit"),
    ],
    [
      "an Extractor half on a deposit",
      new PlaceNode("extractor", 64, 58),
      fail("needs_deposit"),
    ],
    [
      "a Furnace on a deposit",
      new PlaceNode("furnace", 66, 59),
      fail("on_deposit"),
    ],
    [
      "a Furnace touching a deposit's corner cell",
      new PlaceNode("furnace", 64, 57),
      fail("on_deposit"),
    ],
    [
      "a node over the Core",
      new PlaceNode("furnace", 60, 60),
      fail("occupied"),
    ],
    ["a node on water", new PlaceNode("box", 80, 30), fail("on_water")],
    ["a node half on water", new PlaceNode("box", 75, 30), fail("on_water")],
    ["a node off the map", new PlaceNode("box", -1, 30), fail("out_of_bounds")],
    [
      "a node past the map's far edge",
      new PlaceNode("box", 119, 119),
      fail("out_of_bounds"),
    ],
    [
      "a node outside the revealed area",
      new PlaceNode("box", 11, 30),
      fail("out_of_bounds"),
    ],
    [
      "a kind that research has not unlocked",
      new PlaceNode("splitter", 45, 45),
      fail("locked"),
    ],
    ["a second Core", new PlaceNode("core", 45, 45), fail("locked")],
  ];

  it.each(cases)("%s", (_, command, expected) => {
    const { state } = setup();
    expect(command.validate(state)).toEqual(expected);
  });

  it("lets a kind through once research unlocks it", () => {
    const { state } = setup();
    state.unlockedNodes.push("station");
    expect(new PlaceNode("station", 45, 45).validate(state)).toEqual(ok());
  });

  it("refuses a node over one placed earlier", () => {
    const { state, run } = setup();
    run(new PlaceNode("assembler-1", 45, 45));
    expect(new PlaceNode("box", 47, 47).validate(state)).toEqual(
      fail("occupied"),
    );
    expect(new PlaceNode("box", 48, 45).validate(state)).toEqual(ok());
  });
});

describe("PlaceNode", () => {
  it("adds the node with a fresh id", () => {
    const { state, run } = setup();
    expect(run(new PlaceNode("furnace", 55, 53))).toEqual(ok());
    expect(state.nodes.get(2 as NodeId)).toEqual({
      id: 2,
      kind: "furnace",
      x: 55,
      y: 53,
      recipe: null,
      production: { status: "starved", input: {}, output: 0, progress: null },
    });
  });

  it("records the resource under an Extractor", () => {
    const { state, run } = setup();
    run(new PlaceNode("extractor", 51, 59));
    expect(state.nodes.get(2 as NodeId)).toMatchObject({
      kind: "extractor",
      resource: "stone",
    });
  });

  it("drops the second of two queued placements on the same cells", () => {
    const { state, commands, seen, step } = setup();
    expect(commands.dispatch(state, new PlaceNode("box", 45, 45)).ok).toBe(
      true,
    );
    expect(commands.dispatch(state, new PlaceNode("box", 46, 46)).ok).toBe(
      true,
    );
    step();
    expect(state.nodes.size).toBe(2);
    expect(seen).toEqual([
      { type: "CommandRejected", command: "PlaceNode", reason: "occupied" },
    ]);
  });

  it("starts a Furnace or Assembler on a chosen recipe", () => {
    const { state, run } = setup();
    expect(run(new PlaceNode("assembler-1", 45, 45, "gear"))).toEqual(ok());
    expect(state.nodes.get(2 as NodeId)).toMatchObject({ recipe: "gear" });
  });

  it("refuses a recipe the node cannot run", () => {
    const { state } = setup();
    for (const [kind, recipe] of [
      ["furnace", "gear"],
      ["assembler-1", "iron-plate"],
      ["box", "gear"],
    ] as const) {
      expect(new PlaceNode(kind, 45, 45, recipe).validate(state)).toEqual(
        fail("wrong_recipe"),
      );
    }
  });

  it("is undone by removing the node", () => {
    const { state, commands, step, run } = setup();
    run(new PlaceNode("box", 45, 45));
    commands.undo(state);
    step();
    expect([...state.nodes.keys()]).toEqual([CORE_ID]);
  });
});

describe("RemoveNode", () => {
  it("removes a node", () => {
    const { state, run } = setup();
    run(new PlaceNode("box", 45, 45));
    expect(run(new RemoveNode(2 as NodeId))).toEqual(ok());
    expect(state.nodes.has(2 as NodeId)).toBe(false);
  });

  it("refuses to remove the Core", () => {
    const { state } = setup();
    expect(new RemoveNode(CORE_ID).validate(state)).toEqual(
      fail("indestructible"),
    );
  });

  it("refuses a node that does not exist", () => {
    const { state } = setup();
    expect(new RemoveNode(9 as NodeId).validate(state)).toEqual(
      fail("not_found"),
    );
  });

  it("is undone by restoring the same node, id included", () => {
    const { state, commands, step, run } = setup();
    run(new PlaceNode("extractor", 65, 58));
    const placed = structuredClone(state.nodes.get(2 as NodeId));
    run(new RemoveNode(2 as NodeId));
    commands.undo(state);
    step();
    expect(state.nodes.get(2 as NodeId)).toEqual(placed);
  });

  it("returns the items inside to the Core, and its undo takes them back", () => {
    const { state, commands, step, run } = setup();
    run(new PlaceNode("assembler-1", 45, 45, "gear"));
    const assembler = state.nodes.get(2 as NodeId) as ProducerNode;
    // A batch under way, inputs waiting and a finished gear.
    assembler.production.progress = 3;
    assembler.production.input = { "iron-plate": 3 };
    assembler.production.output = 1;
    const core = coreNode(state);
    const before = storedItems(core);
    run(new RemoveNode(2 as NodeId));
    const after = storedItems(core);
    const { cost } = NODES["assembler-1"];
    // 3 waiting and 2 in the batch under way, the gear, and the refund.
    expect(after["iron-plate"]! - before["iron-plate"]!).toBe(
      5 + (cost["iron-plate"] ?? 0),
    );
    expect(after.gear! - before.gear!).toBe(1 + (cost.gear ?? 0));
    commands.undo(state);
    step();
    expect(state.nodes.get(2 as NodeId)).toMatchObject({
      recipe: "gear",
      production: {
        input: { "iron-plate": 3 },
        output: 1,
      },
    });
    expect(storedItems(core).gear).toBe(before.gear);
  });

  it("cannot be undone once another node took the cells", () => {
    const { state, commands, run } = setup();
    run(new PlaceNode("box", 45, 45));
    run(new RemoveNode(2 as NodeId));
    // Placed outside the queue, so the undo stack still ends in the removal.
    state.nodes.set(3 as NodeId, createNode(3 as NodeId, "box", 46, 46));
    expect(commands.undo(state)).toEqual(fail("occupied"));
  });
});

describe("determinism", () => {
  /** Places, removes and undoes on a fixed script. */
  function play() {
    const { state, commands, step } = setup();
    for (let t = 0; t < 60; t++) {
      const kind = STARTING_NODES[t % STARTING_NODES.length];
      commands.dispatch(state, new PlaceNode(kind, 20 + (t % 9) * 4, 20 + t));
      if (t % 5 === 4) {
        const ids = [...state.nodes.keys()];
        commands.dispatch(state, new RemoveNode(ids[t % ids.length]));
      }
      if (t % 7 === 6) commands.undo(state);
      step();
    }
    return { state, log: commands.replayLog };
  }

  it("gives the same state for the same commands", () => {
    const a = play();
    const b = play();
    expect(a.state.nodes.size).toBeGreaterThan(5);
    expect(hashState(a.state)).toBe(hashState(b.state));
  });

  it("round-trips placed nodes through a save", () => {
    const { state } = play();
    const restored = deserializeState(
      JSON.parse(JSON.stringify(serializeState(state))),
    );
    // The power grid is a cache that the first tick recomputes.
    expect({ ...restored, power: null }).toEqual({ ...state, power: null });
    expect(hashState(restored)).toBe(hashState(state));
  });
});
