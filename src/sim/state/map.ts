import {
  INITIAL_REVEALED_SIZE,
  MAP_SIZE,
  RING_STEP,
} from "../../config/constants";
import type { RawResource } from "../../data/items";
import { allCells, containsRect, type Rect } from "../geometry/rect";

export const Terrain = { Land: 0, Water: 1 } as const;
export type Terrain = (typeof Terrain)[keyof typeof Terrain];

/** An infinite patch of one raw resource. */
export interface Deposit extends Rect {
  resource: RawResource;
}

/** The generated map, as plain data so it saves as-is. It is `MAP_SIZE` square. */
export interface GameMap {
  seed: string;
  /** The sub-seed attempt that passed the placement guarantees. */
  subSeed: number;
  /** One entry per cell, row by row: see `cellIndex`. */
  terrain: Terrain[];
  deposits: Deposit[];
  core: Rect;
  /** The outermost revealed ring: 0 is the starting area. */
  revealedRing: number;
}

/** The whole map, as a rect of cells. */
export const MAP_RECT: Readonly<Rect> = {
  x: 0,
  y: 0,
  w: MAP_SIZE,
  h: MAP_SIZE,
};

/** Index of cell (x, y) in the row-major `terrain` array. */
export function cellIndex(x: number, y: number): number {
  return y * MAP_SIZE + x;
}

export function terrainAt(map: GameMap, x: number, y: number): Terrain {
  return map.terrain[cellIndex(x, y)];
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

/** True when every cell of `rect` is on the map and revealed. */
export function isRevealedRect(map: GameMap, rect: Rect): boolean {
  return (
    containsRect(MAP_RECT, rect) &&
    allCells(rect, (x, y) => isRevealed(map, x, y))
  );
}

/** The deposit that wholly contains `rect`, if any. */
export function depositUnder(map: GameMap, rect: Rect): Deposit | undefined {
  return map.deposits.find((d) => containsRect(d, rect));
}
