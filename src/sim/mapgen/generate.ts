import { MAP_SIZE } from "../../config/constants";
import { MAP_GEN, RAW_RESOURCES, type MapGenParams } from "../../data/mapgen";
import {
  cellRing,
  rectDistance,
  revealedSize,
  Terrain,
  terrainAt,
  type GameMap,
  type Rect,
} from "../state/map";
import { createValueNoise, fractalNoise } from "./noise";
import { nextInt, seedRng, type RngState } from "./rng";

/**
 * Generates the whole map from a seed. Each attempt uses the next sub-seed
 * until one passes the placement guarantees, so the same seed always gives the
 * same map.
 */
export function generateMap(
  seed: string,
  params: MapGenParams = MAP_GEN,
): GameMap {
  for (let subSeed = 0; subSeed < params.maxAttempts; subSeed++) {
    const map = tryGenerate(seed, subSeed, params);
    if (map && meetsGuarantees(map, params)) return map;
  }
  throw new Error(
    `No map for seed "${seed}" met the guarantees in ${params.maxAttempts} attempts`,
  );
}

function tryGenerate(
  seed: string,
  subSeed: number,
  params: MapGenParams,
): GameMap | null {
  const rng = seedRng(`${seed}#${subSeed}`);
  const start = Math.floor((MAP_SIZE - params.coreSize) / 2);
  const core = { x: start, y: start, w: params.coreSize, h: params.coreSize };
  const map: GameMap = {
    seed,
    subSeed,
    size: MAP_SIZE,
    terrain: generateLakes(rng, params, core),
    deposits: [],
    core,
    revealedRing: 0,
  };

  for (let ring = 0; ring < params.rings.length; ring++) {
    const { depositSize, deposits } = params.rings[ring];
    for (const resource of RAW_RESOURCES) {
      const count = deposits[resource] ?? 0;
      for (let i = 0; i < count; i++) {
        const isStarter =
          ring === 0 && i === 0 && params.starterResources.includes(resource);
        const minDistance =
          resource === "crude-oil" ? params.oilMinDistance : 0;
        const maxDistance = isStarter ? params.starterDistance : Infinity;
        const rect = placeDeposit(rng, map, params, ring, depositSize, (r) => {
          const distance = rectDistance(map.core, r);
          return distance >= minDistance && distance <= maxDistance;
        });
        if (!rect) return null;
        map.deposits.push({ resource, ...rect });
      }
    }
  }
  return map;
}

function generateLakes(
  rng: RngState,
  params: MapGenParams,
  core: Rect,
): Terrain[] {
  const noise = fractalNoise(createValueNoise(rng), params.lakeOctaves);
  const terrain: Terrain[] = new Array(MAP_SIZE * MAP_SIZE);
  for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      const value = noise(
        (x + 0.5) / params.lakeScale,
        (y + 0.5) / params.lakeScale,
      );
      const nearCore =
        rectDistance(core, { x, y, w: 1, h: 1 }) <= params.coreClearance;
      terrain[y * MAP_SIZE + x] =
        value > params.lakeThreshold && !nearCore
          ? Terrain.Water
          : Terrain.Land;
    }
  }
  return terrain;
}

/** Tries random spots in `ring` until one is free and passes `accept`. */
function placeDeposit(
  rng: RngState,
  map: GameMap,
  params: MapGenParams,
  ring: number,
  [minSize, maxSize]: readonly [number, number],
  accept: (rect: Rect) => boolean,
): Rect | null {
  const side = revealedSize(ring);
  const lo = (MAP_SIZE - side) / 2;
  for (let t = 0; t < params.placementTries; t++) {
    const w = nextInt(rng, minSize, maxSize + 1);
    const h = nextInt(rng, minSize, maxSize + 1);
    const rect = {
      x: nextInt(rng, lo, lo + side - w + 1),
      y: nextInt(rng, lo, lo + side - h + 1),
      w,
      h,
    };
    if (
      accept(rect) &&
      allCells(rect, (x, y) => cellRing(x, y) === ring) &&
      isFree(map, rect, params.depositGap)
    ) {
      return rect;
    }
  }
  return null;
}

function allCells(
  rect: Rect,
  test: (x: number, y: number) => boolean,
): boolean {
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      if (!test(x, y)) return false;
    }
  }
  return true;
}

function overlaps(a: Rect, b: Rect, gap = 0): boolean {
  return (
    a.x < b.x + b.w + gap &&
    b.x < a.x + a.w + gap &&
    a.y < b.y + b.h + gap &&
    b.y < a.y + a.h + gap
  );
}

/** No water under `rect`, and at least `gap` cells from the Core and deposits. */
function isFree(map: GameMap, rect: Rect, gap: number): boolean {
  return (
    allCells(rect, (x, y) => terrainAt(map, x, y) === Terrain.Land) &&
    !overlaps(rect, map.core, gap) &&
    map.deposits.every((d) => !overlaps(rect, d, gap))
  );
}

/**
 * The placement guarantees (FR7, FR8): the starter resources lie close to the
 * Core, oil lies far from it, and no deposit sits on water, on the Core or on
 * another deposit.
 */
export function meetsGuarantees(map: GameMap, params: MapGenParams): boolean {
  const starterNearby = params.starterResources.every((resource) =>
    map.deposits.some(
      (d) =>
        d.resource === resource &&
        rectDistance(map.core, d) <= params.starterDistance,
    ),
  );
  const oilFarAway = map.deposits
    .filter((d) => d.resource === "crude-oil")
    .every(
      (d) =>
        rectDistance(map.core, d) >= params.oilMinDistance &&
        allCells(d, (x, y) => cellRing(x, y) >= params.oilMinRing),
    );
  const clear = map.deposits.every(
    (d, i) =>
      allCells(d, (x, y) => terrainAt(map, x, y) === Terrain.Land) &&
      !overlaps(d, map.core) &&
      map.deposits.every((other, j) => i === j || !overlaps(d, other)),
  );
  return starterNearby && oilFarAway && clear;
}
