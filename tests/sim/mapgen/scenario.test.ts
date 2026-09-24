import { describe, expect, it } from "vitest";
import { MAP_SIZE } from "../../../src/config/constants";
import { EDGE_MAX_LENGTH } from "../../../src/data/edges";
import { NODE_SIZE } from "../../../src/data/nodes";
import {
  MVP_BASE_AREA,
  MVP_CORRIDOR,
  MVP_SCENARIO,
  MVP_WATER_WALL,
} from "../../../src/data/scenarios/mvp";
import type { Scenario } from "../../../src/data/scenarios/scenario";
import { allCells, overlaps, type Rect } from "../../../src/sim/geometry/rect";
import { generateMap } from "../../../src/sim/mapgen/generate";
import { applyScenario } from "../../../src/sim/mapgen/scenario";
import { createGameState } from "../../../src/sim/state/gameState";
import {
  cellIndex,
  isRevealed,
  revealedSize,
  Terrain,
  terrainAt,
  type GameMap,
} from "../../../src/sim/state/map";
import { hashState } from "../../../src/sim/state/serialize";

const map = createGameState(MVP_SCENARIO).map;

const isLand = (x: number, y: number) => terrainAt(map, x, y) === Terrain.Land;

function centre(r: Rect): [number, number] {
  return [r.x + r.w / 2, r.y + r.h / 2];
}

/** Distance between the centres of the Core and `r`, in cells. */
function distanceFromCore(r: Rect): number {
  const [cx, cy] = centre(map.core);
  const [x, y] = centre(r);
  return Math.hypot(x - cx, y - cy);
}

function deposit(resource: string, w: number): Rect {
  const found = map.deposits.find((d) => d.resource === resource && d.w === w);
  expect(found, `${resource} ${w}×${w}`).toBeDefined();
  return found!;
}

/** Runs of land cells in column `x` of the revealed area, as [start, length]. */
function landRuns(x: number): [number, number][] {
  const lo = (MAP_SIZE - revealedSize(map.revealedRing)) / 2;
  const hi = lo + revealedSize(map.revealedRing);
  const runs: [number, number][] = [];
  for (let y = lo; y < hi; y++) {
    if (!isLand(x, y)) continue;
    const last = runs.at(-1);
    if (last && last[0] + last[1] === y) last[1]++;
    else runs.push([y, 1]);
  }
  return runs;
}

/** True when a land path joins `from` to `to` through revealed cells. */
function landPathExists(m: GameMap, from: Rect, to: Rect): boolean {
  const seen = new Uint8Array(MAP_SIZE * MAP_SIZE);
  const queue: [number, number][] = [[from.x, from.y]];
  seen[cellIndex(from.x, from.y)] = 1;
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i];
    if (overlaps(to, { x, y, w: 1, h: 1 })) return true;
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ]) {
      if (nx < 0 || ny < 0 || nx >= MAP_SIZE || ny >= MAP_SIZE) continue;
      if (seen[cellIndex(nx, ny)] || !isRevealed(m, nx, ny)) continue;
      if (terrainAt(m, nx, ny) !== Terrain.Land) continue;
      seen[cellIndex(nx, ny)] = 1;
      queue.push([nx, ny]);
    }
  }
  return false;
}

describe("MVP scenario", () => {
  it("generates the terrain from seed mvp-1 with 96² revealed", () => {
    expect(map.seed).toBe("mvp-1");
    expect(revealedSize(map.revealedRing)).toBe(96);
  });

  it("places the Core 3×3 centred on (60, 60)", () => {
    expect(map.core).toEqual({ x: 59, y: 59, w: 3, h: 3 });
  });

  it("places the starter deposits around the Core", () => {
    const [cx, cy] = centre(map.core);
    const expected = [
      { resource: "iron-ore", size: 5, distance: 7, dx: 1, dy: 0 },
      { resource: "stone", size: 4, distance: 7, dx: -1, dy: 0 },
      { resource: "coal", size: 4, distance: 8, dx: 0, dy: 1 },
      { resource: "copper-ore", size: 3, distance: 10, dx: 0, dy: -1 },
    ];
    for (const { resource, size, distance, dx, dy } of expected) {
      const d = deposit(resource, size);
      const actual = distanceFromCore(d);
      expect(d.h).toBe(size);
      expect(actual, resource).toBeGreaterThanOrEqual(distance - 1);
      expect(actual, resource).toBeLessThanOrEqual(distance + 1);
      // In the stated direction (east, west, south or north), give or take
      // the half cell an even-sided deposit cannot centre on.
      const [x, y] = centre(d);
      expect(Math.abs(x - cx - dx * actual), resource).toBeLessThanOrEqual(1);
      expect(Math.abs(y - cy - dy * actual), resource).toBeLessThanOrEqual(1);
    }
  });

  it("places the big copper 6×6 at x 100–105, y 57–62, about 43 cells away", () => {
    const big = deposit("copper-ore", 6);
    expect(big).toMatchObject({ x: 100, y: 57, w: 6, h: 6 });
    expect(Math.round(distanceFromCore(big))).toBe(43);
  });

  it("replaces the generated deposits, so copper is only where the scenario says", () => {
    expect(map.deposits).toHaveLength(MVP_SCENARIO.deposits.length);
    expect(map.deposits.filter((d) => d.resource === "copper-ore")).toEqual([
      deposit("copper-ore", 3),
      deposit("copper-ore", 6),
    ]);
  });

  it("walls off columns 76–95 over the revealed height, with exactly one gap", () => {
    expect(MVP_WATER_WALL).toEqual({ x: 76, y: 12, w: 20, h: 96 });
    for (
      let x = MVP_WATER_WALL.x;
      x < MVP_WATER_WALL.x + MVP_WATER_WALL.w;
      x++
    ) {
      expect(landRuns(x), `column ${x}`).toEqual([[60, 1]]);
    }
  });

  it("makes the gap a 1×20 corridor at y = 60", () => {
    expect(MVP_CORRIDOR).toEqual({ x: 76, y: 60, w: 20, h: 1 });
    expect(allCells(MVP_CORRIDOR, isLand)).toBe(true);
  });

  it("fits no node footprint anywhere in the corridor", () => {
    const side = NODE_SIZE.min;
    const c = MVP_CORRIDOR;
    for (let y = c.y - side + 1; y < c.y + c.h; y++) {
      for (let x = c.x - side + 1; x < c.x + c.w; x++) {
        const footprint = { x, y, w: side, h: side };
        expect(allCells(footprint, isLand), `${x},${y}`).toBe(false);
      }
    }
  });

  it("makes the corridor longer than the longest level-1 edge", () => {
    expect(MVP_CORRIDOR.w).toBeGreaterThan(EDGE_MAX_LENGTH[0]);
  });

  it("joins the Core to the big copper by land, for the rail", () => {
    expect(landPathExists(map, map.core, deposit("copper-ore", 6))).toBe(true);
  });

  it("clears water from the base area", () => {
    expect(allCells(MVP_BASE_AREA, isLand)).toBe(true);
  });

  it("stamps deterministically, without touching the generated map", () => {
    const generated = generateMap(MVP_SCENARIO.seed);
    const copy = structuredClone(generated);
    expect(applyScenario(generated, MVP_SCENARIO)).toEqual(map);
    expect(generated).toEqual(copy);
    expect(hashState(createGameState(MVP_SCENARIO))).toBe(
      hashState(createGameState(MVP_SCENARIO)),
    );
  });

  it("rejects a scenario that puts a deposit on water", () => {
    const broken: Scenario = {
      ...MVP_SCENARIO,
      deposits: [{ resource: "stone", x: 80, y: 30, w: 2, h: 2 }],
    };
    expect(() => applyScenario(generateMap(MVP_SCENARIO.seed), broken)).toThrow(
      /on water/,
    );
  });
});
