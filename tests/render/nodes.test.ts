import { assert, describe, expect, it } from "vitest";
import { NODE_KINDS, NODES, type NodeKind } from "../../src/data/nodes";
import { RECIPE_IDS, type RecipeId } from "../../src/data/recipes";
import { connectorPoints } from "../../src/render/connectors";
import { flaggedStatus, iconItem } from "../../src/render/nodes";
import type { NodeId } from "../../src/sim/state/ids";
import { canRun, createNode } from "../../src/sim/state/nodes";
import { CELL_PX } from "../../src/render/theme";
import { connectorCount, connectorRows } from "../../src/sim/state/edges";

/** The first recipe `kind` runs, if it runs any. */
function firstRecipe(kind: NodeKind): RecipeId | undefined {
  return RECIPE_IDS.find((recipe) => canRun(kind, recipe));
}

describe("connectorPoints", () => {
  it.each(NODE_KINDS)(
    "puts %s's inputs on the left edge and outputs on the right",
    (kind) => {
      const { size, outputs } = NODES[kind];
      const side = size * CELL_PX;
      const node = { kind, recipe: firstRecipe(kind) };
      const points = connectorPoints(node);
      expect(points.inputs).toHaveLength(connectorCount(node, "input"));
      expect(points.outputs).toHaveLength(outputs);
      expect(points.inputs.every((p) => p.x === 0)).toBe(true);
      expect(points.outputs.every((p) => p.x === side)).toBe(true);
      for (const p of [...points.inputs, ...points.outputs]) {
        expect(p.y).toBeGreaterThan(0);
        expect(p.y).toBeLessThan(side);
      }
    },
  );
});

describe("connector rows", () => {
  it.each(NODE_KINDS)("centres %s's connectors on their edge rows", (kind) => {
    const { size } = NODES[kind];
    const node = { kind, recipe: firstRecipe(kind) };
    const rows = connectorRows(connectorCount(node, "input"), size);
    connectorPoints(node).inputs.forEach((p, i) => {
      expect(Math.floor(p.y / CELL_PX)).toBe(rows[i]);
    });
  });
});

describe("flaggedStatus", () => {
  it("flags every status of a producer but working (FR149)", () => {
    const node = createNode(1 as NodeId, "furnace", 0, 0);
    assert("production" in node);
    for (const status of ["blocked", "starved", "no_power"] as const) {
      node.production.status = status;
      expect(flaggedStatus(node, 1)).toBe(status);
    }
    node.production.status = "working";
    expect(flaggedStatus(node, 1)).toBeNull();
  });

  it("flags low power on a working node while the grid is short (FR64)", () => {
    const node = createNode(1 as NodeId, "furnace", 0, 0);
    assert("production" in node);
    node.production.status = "working";
    expect(flaggedStatus(node, 0.75)).toBe("low_power");
    node.production.status = "starved";
    expect(flaggedStatus(node, 0.75)).toBe("starved");
  });

  it("flags nothing on a node that makes no items", () => {
    expect(flaggedStatus(createNode(1 as NodeId, "box", 0, 0), 0.5)).toBeNull();
  });
});

describe("iconItem", () => {
  it("shows an Extractor's resource", () => {
    const node = createNode(1 as NodeId, "extractor", 0, 0, {
      resource: "stone",
    });
    expect(iconItem(node)).toBe("stone");
  });

  it("shows the resource over most of a mixed Extractor's cells", () => {
    const node = createNode(1 as NodeId, "extractor", 0, 0, {
      coverage: [
        { resource: "iron-ore", cells: 1 },
        { resource: "coal", cells: 2 },
        { resource: "stone", cells: 1 },
      ],
    });
    expect(iconItem(node)).toBe("coal");
  });

  it("shows what a crafter's recipe makes, and nothing without one", () => {
    const node = createNode(1 as NodeId, "assembler-1", 0, 0);
    assert("recipe" in node);
    expect(iconItem(node)).toBeUndefined();
    node.recipe = "gear";
    expect(iconItem(node)).toBe("gear");
  });

  it("shows nothing on a node without a recipe slot", () => {
    expect(iconItem(createNode(1 as NodeId, "core", 0, 0))).toBeUndefined();
  });
});
