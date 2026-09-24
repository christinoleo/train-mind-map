import { describe, expect, it } from "vitest";
import { SpatialHash } from "../../../src/sim/geometry/spatialHash";

describe("SpatialHash", () => {
  it("files an item under every 8×8 bucket its bounds touch", () => {
    const hash = new SpatialHash<string>(8);
    expect(hash.insert("a", { x: 6, y: 6, w: 4, h: 1 })).toHaveLength(2);
    expect(hash.insert("b", { x: 20, y: 20, w: 1, h: 1 })).toHaveLength(1);
    expect(hash.query({ x: 0, y: 0, w: 8, h: 8 })).toEqual(["a"]);
    expect(hash.query({ x: 8, y: 7, w: 1, h: 1 })).toEqual(["a"]);
    expect(hash.query({ x: 0, y: 0, w: 24, h: 24 })).toEqual(["a", "b"]);
    expect(hash.query({ x: 30, y: 0, w: 2, h: 2 })).toEqual([]);
  });

  it("forgets removed items and empty buckets", () => {
    const hash = new SpatialHash<string>(8);
    hash.insert("a", { x: 0, y: 0, w: 9, h: 1 });
    hash.insert("b", { x: 0, y: 0, w: 1, h: 1 });
    hash.remove("a");
    expect(hash.query({ x: 0, y: 0, w: 16, h: 1 })).toEqual(["b"]);
    expect([...hash.occupied()]).toEqual([
      { rect: { x: 0, y: 0, w: 8, h: 8 }, count: 1 },
    ]);
    expect(() => hash.remove("a")).toThrow();
    expect(() => hash.insert("b", { x: 0, y: 0, w: 1, h: 1 })).toThrow();
  });

  it("maps cells to bucket keys and back", () => {
    const hash = new SpatialHash<string>(8);
    expect(hash.bucketRect(hash.keyAt(17, 9))).toEqual({
      x: 16,
      y: 8,
      w: 8,
      h: 8,
    });
  });
});
