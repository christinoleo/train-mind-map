import { describe, expect, it } from "vitest";
import { PlanarIndex, type Point } from "../../../src/sim/geometry/planar";
import { overlaps } from "../../../src/sim/geometry/rect";
import { routeEdge } from "../../../src/sim/geometry/route";
import { fail } from "../../../src/sim/result";
import type { EdgeId, NodeId } from "../../../src/sim/state/ids";
import { landMap } from "./support";

const p = (x: number, y: number): Point => ({ x, y });

function route(index: PlanarIndex, from: Point, to: Point) {
  const result = routeEdge(index, from, to);
  if (!result.ok) throw new Error(`no route: ${result.reason}`);
  return result.value;
}

describe("routeEdge", () => {
  it("runs straight when nothing is in the way", () => {
    const index = new PlanarIndex(landMap());
    expect(route(index, p(2, 5), p(9, 5))).toEqual({
      path: [p(2, 5), p(9, 5)],
      length: 8,
    });
  });

  it("counts a single cell between two connectors as length 1", () => {
    const index = new PlanarIndex(landMap());
    expect(route(index, p(4, 4), p(4, 4))).toEqual({
      path: [p(4, 4)],
      length: 1,
    });
  });

  it("takes a shortest route with the fewest bends", () => {
    const index = new PlanarIndex(landMap());
    const { path, length } = route(index, p(0, 0), p(6, 4));
    expect(length).toBe(11);
    // One bend is the least a diagonal needs, and it leaves heading east.
    expect(path).toEqual([p(0, 0), p(6, 0), p(6, 4)]);
  });

  it("prefers to enter the goal heading east", () => {
    const index = new PlanarIndex(landMap());
    expect(route(index, p(6, 0), p(0, 4)).path).toEqual([
      p(6, 0),
      p(6, 4),
      p(0, 4),
    ]);
  });

  it("goes around a node and water", () => {
    const index = new PlanarIndex(landMap({ x: 10, y: 4, w: 1, h: 3 }));
    index.addNode(1 as NodeId, { x: 5, y: 3, w: 3, h: 3 });
    const { path, length } = route(index, p(2, 4), p(14, 4));
    expect(length).toBe(17);
    expect(index.checkPath(path).ok).toBe(true);
  });

  it("goes around an existing edge and never crosses it", () => {
    const index = new PlanarIndex(landMap());
    index.addEdge(1 as EdgeId, [p(5, 0), p(5, 8)]);
    const { path, length } = route(index, p(2, 4), p(8, 4));
    // Down past the edge's end, across and back up: 5 + 6 + 5 steps.
    expect(length).toBe(17);
    expect(path).toEqual([p(2, 4), p(4, 4), p(4, 9), p(8, 9), p(8, 4)]);
    expect(index.checkPath(path).ok).toBe(true);
  });

  it("threads a one-cell corridor, and fails once it is closed", () => {
    // A wall of water down column 10 with a gap at row 20.
    const index = new PlanarIndex(
      landMap({ x: 10, y: 0, w: 1, h: 20 }, { x: 10, y: 21, w: 1, h: 99 }),
    );
    expect(route(index, p(5, 5), p(15, 5)).path).toEqual([
      p(5, 5),
      p(9, 5),
      p(9, 20),
      p(15, 20),
      p(15, 5),
    ]);
    index.addEdge(1 as EdgeId, [p(10, 20)]);
    expect(routeEdge(index, p(5, 5), p(15, 5))).toEqual(fail("no_route"));
  });

  it("gives up past the longest route asked for", () => {
    const index = new PlanarIndex(landMap({ x: 10, y: 0, w: 1, h: 20 }));
    // Around the wall's end the route is 41 cells long.
    expect(routeEdge(index, p(5, 5), p(15, 5), { maxLength: 41 }).ok).toBe(
      true,
    );
    expect(routeEdge(index, p(5, 5), p(15, 5), { maxLength: 40 })).toEqual(
      fail("out_of_range"),
    );
  });

  it("refuses ends that are blocked or out of bounds", () => {
    const index = new PlanarIndex(landMap({ x: 3, y: 3, w: 1, h: 1 }));
    expect(routeEdge(index, p(3, 3), p(8, 8))).toEqual(fail("no_route"));
    expect(routeEdge(index, p(-1, 0), p(8, 8))).toEqual(fail("out_of_bounds"));
    const bounds = { x: 0, y: 0, w: 10, h: 10 };
    expect(routeEdge(index, p(0, 0), p(12, 0), { bounds })).toEqual(
      fail("out_of_bounds"),
    );
  });

  it("stays inside the bounds", () => {
    const index = new PlanarIndex(landMap({ x: 5, y: 0, w: 1, h: 10 }));
    const bounds = { x: 0, y: 0, w: 20, h: 10 };
    expect(routeEdge(index, p(0, 0), p(9, 0), { bounds })).toEqual(
      fail("no_route"),
    );
    expect(routeEdge(index, p(0, 0), p(9, 0)).ok).toBe(true);
  });

  it("gives the same route every time", () => {
    const build = () => {
      const index = new PlanarIndex(landMap({ x: 30, y: 10, w: 4, h: 40 }));
      index.addNode(1 as NodeId, { x: 20, y: 30, w: 3, h: 3 });
      index.addEdge(1 as EdgeId, [p(40, 0), p(40, 20), p(50, 20)]);
      return index;
    };
    const first = route(build(), p(10, 30), p(60, 25));
    for (let i = 0; i < 5; i++) {
      expect(route(build(), p(10, 30), p(60, 25))).toEqual(first);
    }
  });
});

describe("routeEdge performance", () => {
  const bounds = { x: 12, y: 12, w: 96, h: 96 };

  /** The median time of 21 runs of `run`, in ms, after warming up. */
  function medianMs(run: () => unknown): number {
    for (let i = 0; i < 5; i++) run();
    const times: number[] = [];
    for (let i = 0; i < 21; i++) {
      const start = performance.now();
      run();
      times.push(performance.now() - start);
    }
    return times.sort((a, b) => a - b)[10];
  }

  it("routes across a 96² map in 2 ms or less", () => {
    // A built-up map: a lattice of 3×3 nodes and a few lakes.
    const lakes = [
      { x: 30, y: 40, w: 10, h: 6 },
      { x: 70, y: 20, w: 5, h: 20 },
      { x: 50, y: 80, w: 20, h: 4 },
    ];
    const index = new PlanarIndex(landMap(...lakes));
    let id = 1;
    for (let y = 16; y < 104; y += 8) {
      for (let x = 16; x < 104; x += 8) {
        const node = { x, y, w: 3, h: 3 };
        if (!lakes.some((l) => overlaps(l, node, 1))) {
          index.addNode(id++ as NodeId, node);
        }
      }
    }
    const run = () => routeEdge(index, p(12, 12), p(107, 107), { bounds });
    expect(run().ok).toBe(true);
    expect(medianMs(run)).toBeLessThanOrEqual(2);
  });

  it("stays fast when the route has to snake across the whole map", () => {
    // Staggered walls leave one gap each, alternately at the top and bottom.
    const walls = [];
    for (let x = 12; x < 108; x += 12) {
      const top = (x / 12) % 2 === 0;
      walls.push({ x, y: top ? 12 : 16, w: 1, h: 92 });
    }
    const index = new PlanarIndex(landMap(...walls));
    const run = () => routeEdge(index, p(12, 12), p(107, 107), { bounds });
    const result = run();
    expect(result.ok && result.value.length).toBe(725);
    expect(medianMs(run)).toBeLessThanOrEqual(5);
  });
});
