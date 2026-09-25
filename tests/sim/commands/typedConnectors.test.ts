import { describe, expect, it } from "vitest";
import type { RawResource } from "../../../src/data/items";
import { NODES, type NodeKind } from "../../../src/data/nodes";
import { RECIPE_IDS, type RecipeId } from "../../../src/data/recipes";
import { MVP_SCENARIO } from "../../../src/data/scenarios/mvp";
import { migrate, MIGRATIONS } from "../../../src/platform/save";
import { CommandQueue } from "../../../src/sim/commands/commandQueue";
import type { Command } from "../../../src/sim/commands/command";
import { ConnectEdge } from "../../../src/sim/commands/connectEdge";
import { SetRecipe } from "../../../src/sim/commands/setRecipe";
import { EventQueue } from "../../../src/sim/events";
import { pathLength } from "../../../src/sim/geometry/route";
import { fail, ok } from "../../../src/sim/result";
import {
  connectorCell,
  edgeCost,
  reservedCells,
} from "../../../src/sim/state/edges";
import {
  createGameState,
  type ProducerNode,
} from "../../../src/sim/state/gameState";
import { allocateId, type NodeId } from "../../../src/sim/state/ids";
import { canRun, createNode } from "../../../src/sim/state/nodes";
import { inputTypes } from "../../../src/sim/state/production";
import {
  deserializeState,
  serializeState,
  type SerializedState,
} from "../../../src/sim/state/serialize";
import { store, storedItems } from "../../../src/sim/state/stock";
import { updateStock } from "../../../src/sim/systems/stock";
import { tick } from "../../../src/sim/tick";
import { fillCore } from "../support/stock";

// The MVP map: open land around (50, 50), the Core at (58, 58).
function setup() {
  const state = createGameState(MVP_SCENARIO);
  fillCore(state);
  const commands = new CommandQueue();
  const events = new EventQueue();
  const step = () => {
    tick(state, commands, events.emit);
    events.drain();
  };
  const run = (command: Command) => {
    const result = commands.dispatch(state, command);
    step();
    return result;
  };
  /** Puts a node straight into the state, skipping placement rules. */
  const put = (
    kind: NodeKind,
    x: number,
    y: number,
    { recipe, resource }: { recipe?: RecipeId; resource?: RawResource } = {},
  ): NodeId => {
    const id = allocateId(state.nextIds, "node");
    state.nodes.set(id, createNode(id, kind, x, y, { recipe, resource }));
    updateStock(state);
    return id;
  };
  return { state, commands, step, run, put };
}

const out = (node: NodeId, port = 0) => ({ node, port });
const into = out;

describe("typed inputs (FR25)", () => {
  it("gives a production node one input per ingredient of its recipe", () => {
    const types = (kind: NodeKind, recipe?: RecipeId) =>
      inputTypes(createNode(1 as NodeId, kind, 0, 0, { recipe }));
    expect(types("furnace", "iron-plate")).toEqual(["iron-ore"]);
    expect(types("assembler-1", "circuit")).toEqual([
      "iron-plate",
      "copper-cable",
    ]);
    expect(types("generator")).toEqual(["coal"]);
    expect(types("lab")).toEqual(["red-science"]);
  });

  it("gives an Assembler without a recipe no inputs", () => {
    expect(inputTypes({ kind: "assembler-1", recipe: null })).toEqual([]);
  });

  it("gives a Furnace without a recipe one generic input", () => {
    expect(inputTypes({ kind: "furnace", recipe: null })).toEqual([null]);
  });

  it("keeps storage and logistics connectors generic", () => {
    for (const kind of ["core", "box", "station", "splitter", "merger"]) {
      const types = inputTypes({ kind: kind as NodeKind });
      expect(types).toHaveLength(NODES[kind as NodeKind].inputs);
      expect(types.every((type) => type === null)).toBe(true);
    }
  });

  it.each(RECIPE_IDS)(
    "fits %s's inputs on every node that runs it, a cell each",
    (recipe) => {
      const kinds = (Object.keys(NODES) as NodeKind[]).filter((kind) =>
        canRun(kind, recipe),
      );
      for (const kind of kinds) {
        const node = { kind, recipe, x: 50, y: 50 };
        const count = inputTypes(node).length;
        expect(count).toBeLessThanOrEqual(NODES[kind].inputs);
        expect(count).toBeLessThanOrEqual(NODES[kind].size);
        const cells = Array.from({ length: count }, (_, port) => {
          const c = connectorCell(node, "input", port);
          return `${c.x},${c.y}`;
        });
        expect(new Set(cells).size).toBe(count);
      }
    },
  );
});

describe("ConnectEdge onto a typed input (FR25)", () => {
  it("connects a source that makes the input's item", () => {
    const { state, run, put } = setup();
    const ore = put("extractor", 50, 50, { resource: "iron-ore" });
    const furnace = put("furnace", 56, 50, { recipe: "iron-plate" });
    expect(run(new ConnectEdge(out(ore), into(furnace)))).toEqual(ok());
    expect(state.edges.size).toBe(1);
  });

  it("refuses a source that cannot send the input's item", () => {
    const { state, run, put } = setup();
    const ore = put("extractor", 50, 50, { resource: "stone" });
    const furnace = put("furnace", 56, 50, { recipe: "iron-plate" });
    expect(run(new ConnectEdge(out(ore), into(furnace)))).toEqual(
      fail("wrong_item"),
    );
    expect(state.edges.size).toBe(0);
  });

  it("matches each input of an Assembler to its own ingredient", () => {
    const { run, put } = setup();
    const gears = put("assembler-1", 50, 50, { recipe: "gear" });
    const science = put("assembler-1", 56, 50, { recipe: "red-science" });
    // Red science takes copper plate on input 0 and gears on input 1.
    expect(run(new ConnectEdge(out(gears), into(science, 0)))).toEqual(
      fail("wrong_item"),
    );
    expect(run(new ConnectEdge(out(gears), into(science, 1)))).toEqual(ok());
  });

  it("lets a storage node feed any typed input", () => {
    const { run, put } = setup();
    const box = put("box", 50, 50);
    const science = put("assembler-1", 56, 50, { recipe: "red-science" });
    expect(run(new ConnectEdge(out(box), into(science, 0)))).toEqual(ok());
  });

  it("gives an Assembler without a recipe nothing to connect to", () => {
    const { run, put } = setup();
    const box = put("box", 50, 50);
    const assembler = put("assembler-1", 56, 50);
    expect(run(new ConnectEdge(out(box), into(assembler)))).toEqual(
      fail("not_found"),
    );
  });
});

describe("an automatic Furnace (FR25)", () => {
  it("feeds only generic inputs, since its product changes with its ore", () => {
    const { run, put } = setup();
    const furnace = put("furnace", 50, 50);
    const gears = put("assembler-1", 56, 50, { recipe: "gear" });
    expect(run(new ConnectEdge(out(furnace), into(gears)))).toEqual(
      fail("wrong_item"),
    );
    const box = put("box", 56, 55);
    expect(run(new ConnectEdge(out(furnace), into(box)))).toEqual(ok());
  });
});

describe("a crafter's input cells (FR25)", () => {
  it("stay reserved for every input a recipe may give it", () => {
    const { state, put } = setup();
    const id = put("assembler-1", 56, 50, { recipe: "gear" });
    const node = state.nodes.get(id)!;
    const cells = reservedCells(state).map((c) => `${c.x},${c.y}`);
    // Gear has one input, on row 2; circuit's two sit on rows 1 and 2.
    expect(cells).toContain(`${node.x - 1},${node.y + 1}`);
    expect(cells).toContain(`${node.x - 1},${node.y + 2}`);
  });

  it("refuse a recipe whose new input would sit under another edge", () => {
    const { state, commands, put } = setup();
    const a = put("box", 44, 44);
    const b = put("box", 44, 56);
    const assembler = put("assembler-1", 56, 50, { recipe: "gear" });
    // An edge left over from before, through the cell of circuit's input 0.
    state.edges.set(1 as never, {
      id: 1 as never,
      from: a,
      fromPort: 0,
      to: b,
      toPort: 0,
      level: 1,
      path: [
        { x: 55, y: 49 },
        { x: 55, y: 51 },
        { x: 54, y: 51 },
      ],
      items: [],
    });
    expect(
      commands.dispatch(state, new SetRecipe(assembler, "circuit")),
    ).toEqual(fail("crosses_edge"));
  });
});

describe("a storage sender and a typed input (FR25)", () => {
  it("sends the input only its own item", () => {
    const { state, step, run, put } = setup();
    const box = put("box", 50, 50);
    const node = state.nodes.get(box)!;
    if (!("items" in node)) throw new Error("not a Box");
    store(node, "iron-plate", 20);
    store(node, "stone", 20);
    const rails = put("assembler-1", 56, 50, { recipe: "rail" });
    // Rail takes iron plate on input 0 and stone on input 1.
    expect(run(new ConnectEdge(out(box), into(rails, 1)))).toEqual(ok());
    for (let i = 0; i < 400; i++) step();
    const assembler = state.nodes.get(rails) as ProducerNode;
    expect(assembler.production.input).toEqual({ stone: 2 });
    const edge = [...state.edges.values()][0];
    expect(edge.items.every(({ item }) => item === "stone")).toBe(true);
    expect(storedItems(node)["iron-plate"]).toBe(20);
  });
});

describe("SetRecipe and typed inputs (FR25)", () => {
  /** A circuit Assembler fed iron plate by a Furnace and cable by a Box. */
  function circuitLine() {
    const s = setup();
    const furnace = s.put("furnace", 50, 48, { recipe: "iron-plate" });
    const box = s.put("box", 50, 53);
    const assembler = s.put("assembler-1", 56, 50, { recipe: "circuit" });
    expect(s.run(new ConnectEdge(out(furnace), into(assembler, 0)))).toEqual(
      ok(),
    );
    expect(s.run(new ConnectEdge(out(box), into(assembler, 1)))).toEqual(ok());
    const [plates, cable] = [...s.state.edges.values()];
    return { ...s, furnace, box, assembler, plates, cable };
  }

  it("disconnects the edges the new recipe has no input for, refunded", () => {
    const { state, commands, assembler, plates, cable } = circuitLine();
    plates.items.push({ item: "iron-plate", pos: 0, prevPos: 0 });
    const before = state.stock["iron-ore"]!;
    const plateBefore = state.stock["iron-plate"]!;
    // Copper cable takes copper plate: the Furnace's iron plate no longer fits.
    expect(
      commands.dispatch(state, new SetRecipe(assembler, "copper-cable")),
    ).toEqual(ok());
    tick(state, commands, () => {});
    expect([...state.edges.keys()]).toEqual([cable.id]);
    // The Box stays, moved to the one input, which sits in its cell.
    expect(state.edges.get(cable.id)!.toPort).toBe(0);
    const refund = edgeCost(pathLength(plates.path), 1)["iron-ore"]!;
    expect(state.stock["iron-ore"]).toBe(before + refund);
    expect(state.stock["iron-plate"]).toBe(plateBefore + 1);
  });

  it("puts the disconnected edges back on undo", () => {
    const { state, commands, assembler, plates, cable } = circuitLine();
    const before = { ...state.stock };
    commands.dispatch(state, new SetRecipe(assembler, "copper-cable"));
    tick(state, commands, () => {});
    const undone = commands.undo(state);
    expect(undone).toEqual(ok());
    tick(state, commands, () => {});
    expect(state.nodes.get(assembler)).toMatchObject({ recipe: "circuit" });
    expect(state.edges.get(plates.id)).toMatchObject({ toPort: 0 });
    expect(state.edges.get(cable.id)).toMatchObject({ toPort: 1 });
    expect(state.stock["iron-ore"]).toBe(before["iron-ore"]);
  });

  it("disconnects an output edge into an input its new product does not fit", () => {
    const { state, run, put } = setup();
    const gears = put("assembler-1", 50, 50, { recipe: "gear" });
    const science = put("assembler-1", 56, 50, { recipe: "red-science" });
    expect(run(new ConnectEdge(out(gears), into(science, 1)))).toEqual(ok());
    expect(run(new SetRecipe(gears, "circuit"))).toEqual(ok());
    expect(state.edges.size).toBe(0);
  });
});

describe("save schema 10 (FR25)", () => {
  it("moves old untyped inputs onto the typed ones and drops the rest", () => {
    const { state, put } = setup();
    const iron = put("extractor", 50, 50, { resource: "iron-ore" });
    const stone = put("extractor", 50, 46, { resource: "stone" });
    const furnace = put("furnace", 56, 50, { recipe: "iron-plate" });
    // Schema 9's Furnace had 2 inputs, on rows 0 and 1; its one typed input
    // now sits on row 1.
    const edge = (id: number, from: NodeId, toPort: number, path: number[][]) =>
      state.edges.set(id as never, {
        id: id as never,
        from,
        fromPort: 0,
        to: furnace,
        toPort,
        level: 1,
        path: path.map(([x, y]) => ({ x, y })),
        items: [],
      });
    edge(1, iron, 1, [
      [52, 51],
      [53, 51],
      [54, 51],
      [55, 51],
    ]);
    edge(2, stone, 0, [
      [52, 47],
      [53, 47],
      [54, 47],
      [55, 47],
      [55, 48],
      [55, 49],
      [55, 50],
    ]);
    state.nextIds.edge = 3;
    const ore = state.stock["iron-ore"]!;
    const migrated = migrate(
      { schemaVersion: 9, state: serializeState(state) },
      MIGRATIONS,
      10,
    );
    if (!migrated.ok) throw new Error(migrated.reason);
    const after = deserializeState(migrated.value.state as SerializedState);
    expect([...after.edges.keys()]).toEqual([1]);
    expect(after.edges.get(1 as never)).toMatchObject({ toPort: 0 });
    const dropped = state.edges.get(2 as never)!;
    expect(after.stock["iron-ore"]).toBe(
      ore + edgeCost(pathLength(dropped.path), 1)["iron-ore"]!,
    );
  });
});
