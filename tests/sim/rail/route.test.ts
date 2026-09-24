import { describe, expect, it } from "vitest";
import type { Point } from "../../../src/sim/geometry/planar";
import type { Rect } from "../../../src/sim/geometry/rect";
import { EAST, railCells, routeRail, WEST } from "../../../src/sim/rail/route";
import { fail } from "../../../src/sim/result";

/** A grid from rows of text: `#` is blocked, anything else is free. */
function grid(rows: string[]): { blocked: Uint8Array; bounds: Rect } {
  const w = rows[0].length;
  const blocked = new Uint8Array(w * rows.length);
  rows.forEach((row, y) => {
    for (let x = 0; x < w; x++) blocked[y * w + x] = row[x] === "#" ? 1 : 0;
  });
  return { blocked, bounds: { x: 0, y: 0, w, h: rows.length } };
}

function route(
  rows: string[],
  from: Point,
  to: Point,
  start = EAST,
  end: number | null = EAST,
) {
  const { blocked, bounds } = grid(rows);
  return routeRail(blocked, bounds, from, start, to, end);
}

describe("rail routing (FR79)", () => {
  it("runs straight along a row", () => {
    const r = route(["......"], { x: 0, y: 0 }, { x: 5, y: 0 });
    expect(r).toEqual({
      ok: true,
      value: {
        path: [
          { x: 0, y: 0 },
          { x: 5, y: 0 },
        ],
        length: 6,
      },
    });
  });

  it("takes diagonals, turning 45° at a time", () => {
    const r = route(
      ["......", "......", "......", "......"],
      { x: 0, y: 0 },
      { x: 5, y: 3 },
    );
    expect(r.ok && r.value.length).toBe(6);
    const cells = r.ok ? railCells(r.value.path) : [];
    for (let i = 1; i < cells.length; i++) {
      const dx = Math.abs(cells[i].x - cells[i - 1].x);
      const dy = Math.abs(cells[i].y - cells[i - 1].y);
      expect(Math.max(dx, dy)).toBe(1);
    }
    expect(cells[cells.length - 1]).toEqual({ x: 5, y: 3 });
  });

  it("goes around a block", () => {
    const r = route(
      ["......", "..#...", "......"],
      { x: 0, y: 1 },
      { x: 5, y: 1 },
    );
    expect(r.ok).toBe(true);
    const cells = r.ok ? railCells(r.value.path) : [];
    expect(cells).not.toContainEqual({ x: 2, y: 1 });
  });

  it("never cuts a corner between two blocked cells", () => {
    // The only diagonal gap is between two blocked cells.
    const r = route(
      ["..#", ".#.", "..."],
      { x: 0, y: 0 },
      { x: 2, y: 1 },
      EAST,
      null,
    );
    expect(r.ok).toBe(true);
    const cells = r.ok ? railCells(r.value.path) : [];
    expect(cells).toContainEqual({ x: 1, y: 2 });
  });

  it("refuses when a wall seals the target off", () => {
    const r = route(
      ["..#..", "..#..", "..#.."],
      { x: 0, y: 1 },
      { x: 4, y: 1 },
    );
    expect(r).toEqual(fail("no_route"));
  });

  it("refuses a blocked end", () => {
    expect(route(["..#"], { x: 0, y: 0 }, { x: 2, y: 0 })).toEqual(
      fail("no_route"),
    );
  });

  it("refuses an end outside the bounds", () => {
    expect(route(["..."], { x: 0, y: 0 }, { x: 3, y: 0 })).toEqual(
      fail("out_of_bounds"),
    );
  });

  it("leaves on its start heading and turns at most 90° per cell", () => {
    // Leaving west towards a target in the east: it turns back around.
    const r = route(
      [".....", ".....", "....."],
      { x: 2, y: 1 },
      { x: 4, y: 1 },
      WEST,
      EAST,
    );
    expect(r.ok).toBe(true);
    const cells = r.ok ? railCells(r.value.path) : [];
    // The first step is at most 90° off west: never straight east.
    expect(cells[1].x).toBeLessThanOrEqual(2);
  });

  it("arrives heading into the target", () => {
    // The target must be entered heading east: from the west, not the east.
    const r = route(
      [".....", ".....", "....."],
      { x: 4, y: 1 },
      { x: 1, y: 1 },
      WEST,
      EAST,
    );
    expect(r.ok).toBe(true);
    const cells = r.ok ? railCells(r.value.path) : [];
    const before = cells[cells.length - 2];
    expect(before.x).toBeLessThanOrEqual(1);
  });

  it("is deterministic", () => {
    const rows = Array.from({ length: 20 }, (_, y) =>
      Array.from({ length: 20 }, (_, x) =>
        (x * 7 + y * 3) % 11 === 0 ? "#" : ".",
      ).join(""),
    );
    const a = route(rows, { x: 1, y: 1 }, { x: 18, y: 17 }, EAST, null);
    const b = route(rows, { x: 1, y: 1 }, { x: 18, y: 17 }, EAST, null);
    expect(a.ok).toBe(true);
    expect(a).toEqual(b);
  });
});

describe("rail cells", () => {
  it("lists every cell of straight and diagonal stretches", () => {
    expect(
      railCells([
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 4, y: 2 },
      ]),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 1 },
      { x: 4, y: 2 },
    ]);
  });
});
