import { MAP_SIZE } from "../../config/constants";
import { RAW_RESOURCES } from "../../data/items";
import { MAP_GEN, type MapGenParams } from "../../data/mapgen";
import { assert } from "../assert";
import { allCells, overlaps, rectDistance, type Rect } from "../geometry/rect";
import {
  cellIndex,
  cellRing,
  revealedSize,
  Terrain,
  terrainAt,
  type GameMap,
} from "../state/map";
import { createValueNoise, fractalNoise } from "./noise";
import { nextInt, seedRng, type RngState } from "./rng";

/**
 * Generates the whole map from a seed. Each attempt uses the next sub-seed
 * until every deposit finds a spot, so the same seed always gives the same map.
 *
 * Placement enforces the guarantees (FR7, FR8) by construction: the starter
 * resources lie close to the Core, oil lies far from it, and no deposit sits on
 * water, on the Core or on another deposit.
 */
export function generateMap(
  seed: string,
  params: MapGenParams = MAP_GEN,
): GameMap {
  const startingDeposits = params.rings[0]?.deposits ?? {};
  for (const resource of params.starterResources) {
    assert(
      (startingDeposits[resource] ?? 0) > 0,
      `starter resource ${resource} has no deposit in ring 0`,
    );
  }
  params.rings
    .slice(0, params.oilMinRing)
    .forEach(({ deposits }, ring) =>
      assert(!deposits["crude-oil"], `oil in ring ${ring}`),
    );
  for (let subSeed = 0; subSeed < params.maxAttempts; subSeed++) {
    const map = tryGenerate(seed, subSeed, params);
    if (map) return map;
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
    terrain: generateLakes(rng, params, core),
    deposits: [],
    core,
    revealedRing: 0,
  };

  for (let ring = 0; ring < params.rings.length; ring++) {
    const { depositSize, deposits } = params.rings[ring];
    for (const resource of RAW_RESOURCES) {
      const count = deposits[resource] ?? 0;
      const isOil = resource === "crude-oil";
      for (let i = 0; i < count; i++) {
        const isStarter =
          ring === 0 && i === 0 && params.starterResources.includes(resource);
        const minDistance = isOil ? params.oilMinDistance : 0;
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
      const nearCore =
        rectDistance(core, { x, y, w: 1, h: 1 }) <= params.coreClearance;
      const isLake =
        !nearCore &&
        noise((x + 0.5) / params.lakeScale, (y + 0.5) / params.lakeScale) >
          params.lakeThreshold;
      terrain[cellIndex(x, y)] = isLake ? Terrain.Water : Terrain.Land;
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

/** No water under `rect`, and at least `gap` cells from the Core and deposits. */
function isFree(map: GameMap, rect: Rect, gap: number): boolean {
  return (
    allCells(rect, (x, y) => terrainAt(map, x, y) === Terrain.Land) &&
    !overlaps(rect, map.core, gap) &&
    map.deposits.every((d) => !overlaps(rect, d, gap))
  );
}
