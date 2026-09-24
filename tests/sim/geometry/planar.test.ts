import { describe, expect, it } from "vitest";
import {
  PlanarIndex,
  buildPlanarIndex,
  polylineLength,
  segmentHitsRect,
  segmentsIntersect,
  type Point,
} from "../../../src/sim/geometry/planar";
import { fail, ok } from "../../../src/sim/result";
import { createGameState } from "../../../src/sim/state/gameState";
import type { EdgeId, NodeId } from "../../../src/sim/state/ids";
import { MVP_SCENARIO } from "../../../src/data/scenarios/mvp";
import { landMap } from "./support";

const p = (x: number, y: number): Point => ({ x, y });

describe("segmentsIntersect", () => {
  it("finds a proper crossing", () => {
    expect(segmentsIntersect(p(0, 0), p(4, 4), p(0, 4), p(4, 0))).toBe(true);
    expect(segmentsIntersect(p(0, 2), p(4, 2), p(2, 0), p(2, 4))).toBe(true);
  });

  it("counts a touch at a vertex", () => {
    expect(segmentsIntersect(p(0, 0), p(2, 0), p(2, 0), p(2, 3))).toBe(true);
    expect(segmentsIntersect(p(0, 0), p(4, 0), p(2, 0), p(2, 3))).toBe(true);
  });

  it("counts a collinear overlap, but not collinear segments apart", () => {
    expect(segmentsIntersect(p(0, 0), p(4, 0), p(3, 0), p(6, 0))).toBe(true);
    expect(segmentsIntersect(p(0, 0), p(4, 0), p(4, 0), p(6, 0))).toBe(true);
    expect(segmentsIntersect(p(0, 0), p(3, 0), p(4, 0), p(6, 0))).toBe(false);
  });

  it("keeps parallel and near-miss segments apart", () => {
    expect(segmentsIntersect(p(0, 0), p(4, 0), p(0, 1), p(4, 1))).toBe(false);
    expect(segmentsIntersect(p(0, 0), p(4, 0), p(5, -2), p(5, 2))).toBe(false);
  });

  it("handles a zero-length segment", () => {
    expect(segmentsIntersect(p(2, 0), p(2, 0), p(0, 0), p(4, 0))).toBe(true);
    expect(segmentsIntersect(p(2, 1), p(2, 1), p(0, 0), p(4, 0))).toBe(false);
  });
});

describe("segmentHitsRect", () => {
  const rect = { x: 2, y: 2, w: 2, h: 2 };

  it("finds a segment through, into or along a node's cells", () => {
    expect(segmentHitsRect(p(0, 2), p(6, 2), rect)).toBe(true);
    expect(segmentHitsRect(p(0, 3), p(3, 3), rect)).toBe(true);
    expect(segmentHitsRect(p(3, 3), p(3, 3), rect)).toBe(true);
  });

  it("lets a segment pass beside the node", () => {
    expect(segmentHitsRect(p(0, 1), p(6, 1), rect)).toBe(false);
    expect(segmentHitsRect(p(4, 0), p(4, 6), rect)).toBe(false);
    expect(segmentHitsRect(p(0, 0), p(1, 1), rect)).toBe(false);
  });
});

describe("polylineLength", () => {
  it("sums the segments and rounds up", () => {
    expect(polylineLength([p(0, 0), p(5, 0), p(5, 3)])).toBe(8);
    expect(polylineLength([p(0, 0), p(1, 1)])).toBe(2);
    expect(polylineLength([p(3, 3)])).toBe(0);
  });
});

describe("PlanarIndex", () => {
  const node = 1 as NodeId;
  const edge = 1 as EdgeId;

  it("blocks the cells of water, nodes and edges", () => {
    const index = new PlanarIndex(landMap({ x: 10, y: 10, w: 2, h: 1 }));
    index.addNode(node, { x: 20, y: 20, w: 2, h: 2 });
    index.addEdge(edge, [p(30, 5), p(30, 9), p(33, 9)]);
    for (const [x, y] of [
      [10, 10],
      [11, 10],
      [21, 21],
      [30, 7],
      [32, 9],
    ]) {
      expect(index.isBlocked(x, y)).toBe(true);
    }
    for (const [x, y] of [
      [12, 10],
      [22, 21],
      [31, 7],
      [34, 9],
    ]) {
      expect(index.isBlocked(x, y)).toBe(false);
    }
  });

  it("unblocks cells when a node or an edge leaves", () => {
    const index = new PlanarIndex(landMap());
    index.addNode(node, { x: 7, y: 7, w: 2, h: 2 });
    index.addEdge(edge, [p(0, 0), p(9, 0)]);
    expect(index.isBlocked(8, 8)).toBe(true);
    expect(index.isBlocked(9, 0)).toBe(true);
    index.removeNode(node);
    index.removeEdge(edge);
    expect(index.isBlocked(8, 8)).toBe(false);
    expect(index.isBlocked(9, 0)).toBe(false);
  });

  it("checks a path against the planar rule", () => {
    const index = new PlanarIndex(landMap({ x: 10, y: 0, w: 1, h: 5 }));
    index.addNode(node, { x: 20, y: 0, w: 3, h: 3 });
    index.addEdge(edge, [p(30, 0), p(30, 10)]);
    expect(index.checkPath([p(0, 2), p(9, 2)])).toEqual(ok());
    expect(index.checkPath([p(0, 2), p(12, 2)])).toEqual(fail("on_water"));
    expect(index.checkPath([p(15, 2), p(21, 2)])).toEqual(fail("crosses_node"));
    expect(index.checkPath([p(25, 4), p(35, 4)])).toEqual(fail("crosses_edge"));
    // Ending on the edge is a touch at a vertex, which crosses too.
    expect(index.checkPath([p(25, 10), p(30, 10)])).toEqual(
      fail("crosses_edge"),
    );
    expect(index.checkPath([p(25, 11), p(35, 11)])).toEqual(ok());
  });

  it("indexes a game's water and nodes", () => {
    const state = createGameState(MVP_SCENARIO);
    const index = buildPlanarIndex(state);
    const { core } = state.map;
    expect(index.isBlocked(core.x + 1, core.y + 1)).toBe(true);
    expect(index.isBlocked(core.x - 1, core.y)).toBe(false);
    // The MVP water wall runs down columns 76–95.
    expect(index.isBlocked(80, 30)).toBe(true);
  });
});
