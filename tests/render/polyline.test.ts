import { describe, expect, it } from "vitest";
import { itemMix, measure, pointAt, slice } from "../../src/render/polyline";

// An L: 10 right, then 5 down.
const L = measure([
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 5 },
]);

describe("measure", () => {
  it("sums the segments and boxes the line", () => {
    expect(L.lengths).toEqual([0, 10, 15]);
    expect(L.length).toBe(15);
    expect(L.bounds).toEqual({ x: 0, y: 0, w: 10, h: 5 });
  });
});

describe("pointAt", () => {
  it("walks the line, clamped to its ends", () => {
    const at = { x: 0, y: 0 };
    pointAt(L, 4, at);
    expect(at).toEqual({ x: 4, y: 0 });
    pointAt(L, 12, at);
    expect(at).toEqual({ x: 10, y: 2 });
    pointAt(L, 99, at);
    expect(at).toEqual({ x: 10, y: 5 });
    pointAt(L, -1, at);
    expect(at).toEqual({ x: 0, y: 0 });
  });

  it("finds the same point from any hint", () => {
    const a = { x: 0, y: 0 };
    const b = { x: 0, y: 0 };
    pointAt(L, 3, a, 2);
    pointAt(L, 3, b, 1);
    expect(a).toEqual(b);
    pointAt(L, 13, a, 1);
    pointAt(L, 13, b, 2);
    expect(a).toEqual(b);
  });
});

describe("slice", () => {
  it("keeps the bends inside the range", () => {
    expect(slice(L, 8, 12)).toEqual([
      { x: 8, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 2 },
    ]);
    expect(slice(L, 1, 3)).toEqual([
      { x: 1, y: 0 },
      { x: 3, y: 0 },
    ]);
  });
});

describe("itemMix", () => {
  it("puts the most common item first, ties in item order", () => {
    const on = (...items: string[]) =>
      itemMix(items.map((item) => ({ item }) as never));
    expect(on()).toEqual([]);
    expect(on("coal", "iron-ore", "coal")).toEqual(["coal", "iron-ore"]);
    expect(on("coal", "iron-ore")).toEqual(["iron-ore", "coal"]);
  });
});
