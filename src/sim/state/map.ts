import {
  INITIAL_REVEALED_SIZE,
  MAP_SIZE,
  RING_STEP,
} from "../../config/constants";
import type { RawResource } from "../../data/mapgen";

export const Terrain = { Land: 0, Water: 1 } as const;
export type Terrain = (typeof Terrain)[keyof typeof Terrain];

/** An axis-aligned block of cells: top-left cell, width and height. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** An infinite patch of one raw resource. */
export interface Deposit extends Rect {
  resource: RawResource;
}

/** The generated map, as plain data so it saves as-is. */
export interface GameMap {
  seed: string;
  /** The sub-seed attempt that passed the placement guarantees. */
  subSeed: number;
  size: number;
  /** One entry per cell, row by row: `terrain[y * size + x]`. */
  terrain: Terrain[];
  deposits: Deposit[];
  core: Rect;
  /** The outermost revealed ring: 0 is the starting area. */
  revealedRing: number;
}

export function terrainAt(map: GameMap, x: number, y: number): Terrain {
  return map.terrain[y * map.size + x];
}

/**
 * The ring a cell belongs to: 0 for the starting area, and one more for each
 * band of `RING_STEP` cells around it.
 */
export function cellRing(x: number, y: number): number {
  const centre = MAP_SIZE / 2;
  // Distance from the map centre to the cell's far edge, on each axis.
  const dx = x < centre ? centre - x : x + 1 - centre;
  const dy = y < centre ? centre - y : y + 1 - centre;
  const beyond = Math.max(dx, dy) - INITIAL_REVEALED_SIZE / 2;
  return Math.max(0, Math.ceil(beyond / RING_STEP));
}

/** Side of the revealed square when `ring` is the outermost revealed ring. */
export function revealedSize(ring: number): number {
  return INITIAL_REVEALED_SIZE + 2 * RING_STEP * ring;
}

export function isRevealed(map: GameMap, x: number, y: number): boolean {
  return cellRing(x, y) <= map.revealedRing;
}

/** The shortest distance between two rects, in cells; 0 when they touch. */
export function rectDistance(a: Rect, b: Rect): number {
  const dx = Math.max(0, b.x - (a.x + a.w), a.x - (b.x + b.w));
  const dy = Math.max(0, b.y - (a.y + a.h), a.y - (b.y + b.h));
  return Math.hypot(dx, dy);
}
