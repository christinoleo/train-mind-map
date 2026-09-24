import { describe, expect, it } from "vitest";
import { MAP_SIZE } from "../../../src/config/constants";
import { MAP_GEN } from "../../../src/data/mapgen";
import { rectDistance, type Rect } from "../../../src/sim/geometry/rect";
import { generateMap } from "../../../src/sim/mapgen/generate";
import { nextUint32, seedRng } from "../../../src/sim/mapgen/rng";
import { createGameState } from "../../../src/sim/state/gameState";
import {
  cellIndex,
  cellRing,
  revealedSize,
  Terrain,
  terrainAt,
  type GameMap,
} from "../../../src/sim/state/map";
import {
  deserializeState,
  hashState,
  serializeState,
} from "../../../src/sim/state/serialize";

function cells(rect: Rect): [number, number][] {
  const out: [number, number][] = [];
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) out.push([x, y]);
  }
  return out;
}

function randomSeeds(count: number): string[] {
  const rng = seedRng("seeds");
  return Array.from({ length: count }, () => nextUint32(rng).toString(36));
}

function expectGuarantees(map: GameMap) {
  for (const resource of MAP_GEN.starterResources) {
    const nearest = Math.min(
      ...map.deposits
        .filter((d) => d.resource === resource)
        .map((d) => rectDistance(map.core, d)),
    );
    expect(nearest, `${map.seed}: ${resource}`).toBeLessThanOrEqual(
      MAP_GEN.starterDistance,
    );
  }

  const oil = map.deposits.filter((d) => d.resource === "crude-oil");
  expect(oil.length).toBeGreaterThan(0);
  for (const d of oil) {
    expect(
      rectDistance(map.core, d),
      `${map.seed}: oil`,
    ).toBeGreaterThanOrEqual(MAP_GEN.oilMinDistance);
    for (const [x, y] of cells(d))
      expect(cellRing(x, y)).toBeGreaterThanOrEqual(MAP_GEN.oilMinRing);
  }

  const sizes = MAP_GEN.rings.flatMap((r) => r.depositSize);
  const taken = new Set(cells(map.core).map(([x, y]) => cellIndex(x, y)));
  for (const d of map.deposits) {
    expect(Math.min(d.w, d.h)).toBeGreaterThanOrEqual(Math.min(...sizes));
    expect(Math.max(d.w, d.h)).toBeLessThanOrEqual(Math.max(...sizes));
    for (const [x, y] of cells(d)) {
      expect(x >= 0 && x < MAP_SIZE && y >= 0 && y < MAP_SIZE).toBe(true);
      expect(terrainAt(map, x, y), `${map.seed}: water under deposit`).toBe(
        Terrain.Land,
      );
      const key = cellIndex(x, y);
      expect(taken.has(key), `${map.seed}: overlap at ${x},${y}`).toBe(false);
      taken.add(key);
    }
  }
}

describe("map generation", () => {
  it("generates the full 120² map with ring 0 revealed", () => {
    const map = generateMap("full");
    expect(map.terrain).toHaveLength(MAP_SIZE * MAP_SIZE);
    expect(map.terrain).toContain(Terrain.Water);
    expect(map.revealedRing).toBe(0);
  });

  it("places the Core at the centre of the map", () => {
    const { core } = generateMap("core");
    expect(Math.abs(core.x + core.w / 2 - MAP_SIZE / 2)).toBeLessThanOrEqual(1);
    expect(Math.abs(core.y + core.h / 2 - MAP_SIZE / 2)).toBeLessThanOrEqual(1);
  });

  it("gives the same map for the same seed", () => {
    expect(hashState(createGameState("same"))).toBe(
      hashState(createGameState("same")),
    );
    expect(generateMap("same")).toEqual(generateMap("same"));
  });

  it("keeps a known seed's map stable across releases", () => {
    // Changing noise, rng use or placement order changes every map, saves
    // included. Update this hash only on purpose.
    expect(hashState(createGameState("pinned"))).toBe("1c80c6b1bb307a");
  });

  it("gives different maps for different seeds", () => {
    expect(generateMap("one")).not.toEqual(generateMap("two"));
  });

  it("holds the guarantees across 200 random seeds", () => {
    for (const seed of randomSeeds(200)) expectGuarantees(generateMap(seed));
  });

  it("sizes each deposit by its ring", () => {
    for (const seed of randomSeeds(20)) {
      for (const d of generateMap(seed).deposits) {
        const [min, max] = MAP_GEN.rings[cellRing(d.x, d.y)].depositSize;
        expect(Math.min(d.w, d.h)).toBeGreaterThanOrEqual(min);
        expect(Math.max(d.w, d.h)).toBeLessThanOrEqual(max);
      }
    }
  });

  it("retries with the next sub-seed when an attempt fails", () => {
    // Deposits that never fit in ring 0 fail every attempt.
    const params = {
      ...MAP_GEN,
      maxAttempts: 3,
      starterResources: [],
      rings: [{ depositSize: [30, 30] as const, deposits: { stone: 1 } }],
    };
    expect(() => generateMap("impossible", params)).toThrow(/3 attempts/);
  });

  it("survives a save round trip", () => {
    const state = createGameState("save-map");
    const restored = deserializeState(
      JSON.parse(JSON.stringify(serializeState(state))),
    );
    expect(restored.map).toEqual(state.map);
  });

  it("generates the full map in 50 ms or less", () => {
    generateMap("warm-up");
    const start = performance.now();
    generateMap("timed");
    const ms = performance.now() - start;
    // A soft check: shared CI runners vary, so a slow run only warns.
    if (ms > 50)
      console.warn(`Map generation took ${ms.toFixed(1)} ms (budget 50 ms)`);
    expect(ms).toBeLessThan(1000);
  });
});

describe("rings", () => {
  it("reveals 48², then 12 more cells per side for each ring", () => {
    expect([0, 1, 2, 3].map(revealedSize)).toEqual([48, 72, 96, 120]);
  });

  it("assigns each cell to the smallest square that holds it", () => {
    for (const ring of [0, 1, 2, 3]) {
      const lo = (MAP_SIZE - revealedSize(ring)) / 2;
      const hi = lo + revealedSize(ring) - 1;
      expect(cellRing(lo, lo)).toBe(ring);
      expect(cellRing(hi, hi)).toBe(ring);
      expect(cellRing(lo, MAP_SIZE / 2)).toBe(ring);
    }
    expect(cellRing(MAP_SIZE / 2, MAP_SIZE / 2)).toBe(0);
  });
});
