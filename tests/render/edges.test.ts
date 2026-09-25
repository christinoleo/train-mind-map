import { Container, Graphics } from "pixi.js";
import { describe, expect, it } from "vitest";
import { EdgeViews } from "../../src/render/edges";
import { ITEM_COLOR, PALETTE } from "../../src/render/theme";
import type { Edge, FactoryNode } from "../../src/sim/state/gameState";
import type { EdgeId, NodeId } from "../../src/sim/state/ids";
import { createNode } from "../../src/sim/state/nodes";

const A = 1 as NodeId;
const B = 2 as NodeId;
const ID = 1 as EdgeId;

/** Two boxes 3 cells apart, joined by an edge along row 1. */
function scene() {
  const nodes = new Map<NodeId, FactoryNode>([
    [A, createNode(A, "box", 0, 0)],
    [B, createNode(B, "box", 6, 0)],
  ]);
  const edge: Edge = {
    id: ID,
    from: A,
    fromPort: 0,
    to: B,
    toPort: 0,
    level: 1,
    path: [
      { x: 2, y: 1 },
      { x: 5, y: 1 },
    ],
    items: [],
  };
  const layer = new Container();
  const views = new EdgeViews(layer);
  const edges = new Map([[ID, edge]]);
  const sync = (lod: "overview" | "graph", selected: EdgeId | null = null) =>
    views.sync(edges, nodes, selected, false, null, lod);
  return { edge, layer, views, sync };
}

describe("EdgeViews", () => {
  it("tints an edge by its main item, and keeps it once empty (FR149)", () => {
    const { edge, layer, sync } = scene();
    sync("graph");
    const [stroke] = layer.children as Graphics[];
    expect(stroke.tint).toBe(PALETTE.edge);
    edge.items.push(
      { item: "coal", pos: 0, prevPos: 0 },
      { item: "coal", pos: 60, prevPos: 60 },
      { item: "iron-ore", pos: 120, prevPos: 120 },
    );
    sync("graph");
    expect(stroke.tint).toBe(ITEM_COLOR.coal);
    edge.items.length = 0;
    sync("graph");
    expect(stroke.tint).toBe(ITEM_COLOR.coal);
  });

  it("swaps the stroke for dashes in the overview", () => {
    const { edge, layer, views, sync } = scene();
    edge.items.push({ item: "coal", pos: 0, prevPos: 0 });
    sync("overview");
    const [stroke, dashes] = layer.children;
    expect(stroke.visible).toBe(false);
    expect(dashes.visible).toBe(true);
    sync("graph");
    expect(stroke.visible).toBe(true);
    expect(dashes.visible).toBe(false);
    expect(views.lineOf(ID)?.length).toBeGreaterThan(0);
  });

  it("keeps an empty edge's tint when it is redrawn", () => {
    const { edge, layer, sync } = scene();
    edge.items.push({ item: "coal", pos: 0, prevPos: 0 });
    sync("graph");
    edge.items.length = 0;
    sync("graph", ID);
    sync("graph");
    const [stroke] = layer.children as Graphics[];
    expect(stroke.tint).toBe(ITEM_COLOR.coal);
  });

  it("keeps the selected edge's stroke in the overview", () => {
    const { edge, layer, sync } = scene();
    edge.items.push({ item: "coal", pos: 0, prevPos: 0 });
    sync("overview", ID);
    const [stroke] = layer.children as Graphics[];
    expect(stroke.visible).toBe(true);
    expect(stroke.tint).toBe(PALETTE.output);
  });
});
