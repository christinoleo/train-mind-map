import { describe, expect, it } from "vitest";
import {
  EDGE_COUNT,
  generateScene,
  intersects,
  makePath,
  pointAt,
  seededRandom,
  TRAIN_PATH_COUNT,
  WORLD_CELLS,
} from "../../../src/debug/stress/scene";

describe("pointAt", () => {
  const path = makePath([
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 5 },
  ]);

  it("measures the path", () => {
    expect(path.length).toBe(15);
    expect(path.bounds).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 5 });
  });

  it("interpolates along each segment", () => {
    const p = { x: 0, y: 0 };
    expect(pointAt(path, 4, p)).toEqual({ x: 4, y: 0 });
    expect(pointAt(path, 12, p)).toEqual({ x: 10, y: 2 });
  });

  it("wraps distances past either end", () => {
    const p = { x: 0, y: 0 };
    expect(pointAt(path, 19, p)).toEqual({ x: 4, y: 0 });
    expect(pointAt(path, -3, p)).toEqual({ x: 10, y: 2 });
  });
});

describe("generateScene", () => {
  it("is the same for the same seed", () => {
    expect(generateScene(17)).toEqual(generateScene(17));
    expect(generateScene(17)).not.toEqual(generateScene(18));
  });

  it("keeps every path inside the world", () => {
    const scene = generateScene(17);
    expect(scene.edges).toHaveLength(EDGE_COUNT);
    expect(scene.trainPaths).toHaveLength(TRAIN_PATH_COUNT);
    for (const path of [...scene.edges, ...scene.trainPaths]) {
      expect(path.length).toBeGreaterThan(0);
      expect(path.bounds.minX).toBeGreaterThanOrEqual(0);
      expect(path.bounds.minY).toBeGreaterThanOrEqual(0);
      expect(path.bounds.maxX).toBeLessThanOrEqual(WORLD_CELLS);
      expect(path.bounds.maxY).toBeLessThanOrEqual(WORLD_CELLS);
    }
  });

  it("makes train paths closed loops longer than edges", () => {
    const scene = generateScene(17);
    const longestEdge = Math.max(...scene.edges.map((e) => e.length));
    for (const path of scene.trainPaths) {
      expect(path.points[0]).toEqual(path.points[path.points.length - 1]);
      expect(path.length).toBeGreaterThan(longestEdge);
    }
  });
});

describe("seededRandom", () => {
  it("returns floats in [0, 1)", () => {
    const rand = seededRandom(1);
    for (let i = 0; i < 1000; i++) {
      const v = rand();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("intersects", () => {
  const a = { minX: 0, minY: 0, maxX: 10, maxY: 10 };

  it("detects overlap and touching edges", () => {
    expect(intersects(a, { minX: 5, minY: 5, maxX: 20, maxY: 20 })).toBe(true);
    expect(intersects(a, { minX: 10, minY: 0, maxX: 20, maxY: 5 })).toBe(true);
  });

  it("rejects disjoint boxes", () => {
    expect(intersects(a, { minX: 11, minY: 0, maxX: 20, maxY: 5 })).toBe(false);
  });
});
