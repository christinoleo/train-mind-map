import { describe, expect, it } from "vitest";
import { MAP_SIZE } from "../../src/config/constants";
import { ITEMS, RAW_RESOURCES } from "../../src/data/items";
import {
  isInside,
  revealedBounds,
  roundedCorners,
} from "../../src/render/mapView";
import { ITEM_STYLE } from "../../src/render/theme";
import { createGameState } from "../../src/sim/state/gameState";
import {
  cellIndex,
  isRevealed,
  revealedSize,
  Terrain,
  waterRuns,
  type GameMap,
} from "../../src/sim/state/map";
import { hashState } from "../../src/sim/state/serialize";

function mapWithWater(cells: [number, number][]): GameMap {
  const { map } = createGameState("render-test");
  map.terrain.fill(Terrain.Land);
  for (const [x, y] of cells) map.terrain[cellIndex(x, y)] = Terrain.Water;
  return map;
}

describe("revealedBounds", () => {
  it("is the square of revealed cells", () => {
    const { map } = createGameState("render-test");
    for (let ring = 0; revealedSize(ring) <= MAP_SIZE; ring++) {
      map.revealedRing = ring;
      const b = revealedBounds(map);
      expect(b.w).toBe(revealedSize(ring));
      expect(isRevealed(map, b.x, b.y)).toBe(true);
      expect(isRevealed(map, b.x + b.w - 1, b.y + b.h - 1)).toBe(true);
      if (b.x > 0) expect(isRevealed(map, b.x - 1, b.y)).toBe(false);
    }
  });
});

describe("waterRuns", () => {
  it("merges water cells into row runs clipped to the bounds", () => {
    const map = mapWithWater([
      [10, 5],
      [11, 5],
      [12, 5],
      [14, 5],
      [9, 6],
    ]);
    const runs = waterRuns(map, { x: 10, y: 5, w: 5, h: 2 });
    expect(runs).toEqual([
      { x: 10, y: 5, w: 3, h: 1 },
      { x: 14, y: 5, w: 1, h: 1 },
    ]);
  });

  it("covers exactly the water cells of the revealed area", () => {
    const { map } = createGameState("render-test");
    const bounds = revealedBounds(map);
    const covered = waterRuns(map, bounds).reduce((n, r) => n + r.w, 0);
    let water = 0;
    for (let y = bounds.y; y < bounds.y + bounds.h; y++) {
      for (let x = bounds.x; x < bounds.x + bounds.w; x++) {
        if (map.terrain[cellIndex(x, y)] === Terrain.Water) water++;
      }
    }
    expect(covered).toBe(water);
  });

  it("leaves the state untouched", () => {
    const state = createGameState("render-test");
    const before = hashState(state);
    waterRuns(state.map, revealedBounds(state.map));
    expect(hashState(state)).toBe(before);
  });
});

describe("isInside", () => {
  it("accepts rects on the edge and rejects ones that stick out", () => {
    const bounds = { x: 0, y: 0, w: 10, h: 10 };
    expect(isInside({ x: 6, y: 6, w: 4, h: 4 }, bounds)).toBe(true);
    expect(isInside({ x: 7, y: 6, w: 4, h: 4 }, bounds)).toBe(false);
  });
});

describe("roundedCorners", () => {
  it("rounds the four outer corners of a lone water cell", () => {
    const map = mapWithWater([[10, 10]]);
    const corners = roundedCorners(map, { x: 8, y: 8, w: 5, h: 5 });
    expect(corners).toHaveLength(4);
    expect(corners.every((c) => c.fill === "ground")).toBe(true);
    expect(corners).toContainEqual({
      x: 10,
      y: 10,
      dx: 1,
      dy: 1,
      fill: "ground",
    });
    expect(corners).toContainEqual({
      x: 11,
      y: 11,
      dx: -1,
      dy: -1,
      fill: "ground",
    });
  });

  it("fills the inner corner of an L-shaped lake with water", () => {
    const map = mapWithWater([
      [10, 10],
      [11, 10],
      [10, 11],
      [11, 11],
      [12, 10],
      [12, 11],
      [10, 12],
      [11, 12],
    ]);
    const corners = roundedCorners(map, { x: 8, y: 8, w: 7, h: 7 });
    const water = corners.filter((c) => c.fill === "water");
    expect(water).toEqual([{ x: 12, y: 12, dx: 1, dy: 1, fill: "water" }]);
  });

  it("finds nothing on dry land", () => {
    const map = mapWithWater([]);
    expect(roundedCorners(map, { x: 0, y: 0, w: 10, h: 10 })).toEqual([]);
  });
});

describe("ITEM_STYLE", () => {
  it("gives every resource its own glyph shape (FR150)", () => {
    const shapes = RAW_RESOURCES.map((r) => ITEM_STYLE[r].shape);
    expect(new Set(shapes).size).toBe(shapes.length);
  });

  it("gives no two items the same colour and shape (FR150)", () => {
    const looks = ITEMS.map(
      (i) => `${ITEM_STYLE[i].color}|${ITEM_STYLE[i].shape}`,
    );
    expect(new Set(looks).size).toBe(ITEMS.length);
  });
});
