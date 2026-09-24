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
import { createNode } from "../../../src/sim/state/nodes";
import {
  acceptItem,
  batchTicks,
  takeOutput,
} from "../../../src/sim/state/production";
import { tick } from "../../../src/sim/tick";

/** A game with one producing node, placed directly, and a tick driver. */
function setup(kind: NodeKind, recipe?: RecipeId) {
  const state = createGameState("production");
  const commands = new CommandQueue();
  const events: SimEvent[] = [];
  const id = allocateId(state.nextIds, "node");
  const node = createNode(id, kind, 0, 0, {
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
      for (const item of feed) acceptItem(node, item);
      tick(state, commands, (e) => events.push(e));
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

describe("Furnace", () => {
  it("smelts 1 iron plate every 3.2 s", () => {
    const { run, made } = setup("furnace");
    run(320, ["iron-ore"]);
    expect(made).toEqual(Array(10).fill("iron-plate"));
  });

  it("picks the smelting recipe of its first input", () => {
    const { node } = setup("furnace");
    expect(acceptItem(node, "stone")).toBe(true);
    expect(node).toMatchObject({ recipe: "brick" });
    // Iron ore has no place while stone is inside.
    expect(acceptItem(node, "iron-ore")).toBe(false);
  });

  it("switches recipe once it is empty", () => {
    const { node, run } = setup("furnace");
    acceptItem(node, "copper-ore");
    run(32);
    expect(node.production.output).toBe(0);
    expect(acceptItem(node, "iron-ore")).toBe(true);
    expect(node).toMatchObject({ recipe: "iron-plate" });
  });

  it("refuses items no smelting recipe takes", () => {
    const { node } = setup("furnace");
    expect(acceptItem(node, "coal")).toBe(false);
    expect(acceptItem(node, "iron-plate")).toBe(false);
  });
});

describe("input buffers", () => {
  it("hold 2× what one batch needs, per item type", () => {
    const { node } = setup("furnace", "brick");
    for (let i = 0; i < 4; i++) expect(acceptItem(node, "stone")).toBe(true);
    expect(acceptItem(node, "stone")).toBe(false);
    expect(node.production.input).toEqual({ stone: 4 });
  });

  it("take every ingredient of the recipe, each in its own buffer", () => {
    const { node } = setup("assembler-1", "circuit");
    for (let i = 0; i < 6; i++) acceptItem(node, "copper-cable");
    for (let i = 0; i < 2; i++) acceptItem(node, "iron-plate");
    expect(acceptItem(node, "iron-plate")).toBe(false);
    expect(acceptItem(node, "copper-cable")).toBe(false);
    expect(acceptItem(node, "gear")).toBe(false);
    expect(node.production.input).toEqual({
      "copper-cable": 6,
      "iron-plate": 2,
    });
  });

  it("refuse everything in an Assembler with no recipe", () => {
    const { node, run } = setup("assembler-1");
    expect(acceptItem(node, "iron-plate")).toBe(false);
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
    acceptItem(node, "iron-plate");
    run(5);
    expect(node.production.status).toBe("starved");
    acceptItem(node, "iron-plate");
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
