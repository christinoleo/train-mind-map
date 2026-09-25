import { CELL_PX, MIN_TOUCH_PX } from "../config/constants";
import type { Point } from "../sim/geometry/planar";
import { containsCell, type Rect } from "../sim/geometry/rect";
import type { FactoryNode, GameState } from "../sim/state/gameState";
import { depositUnder, isRevealed, type Deposit } from "../sim/state/map";
import { nodeRect } from "../sim/state/nodes";

/**
 * True when world point (`x`, `y`) falls on `rect`, in world units, grown
 * about its centre to at least `MIN_TOUCH_PX` screen pixels per side at
 * `scale` screen pixels per world unit, so small targets stay tappable at
 * any zoom (FR133).
 */
export function hitsRect(rect: Rect, x: number, y: number, scale: number) {
  const min = MIN_TOUCH_PX / scale;
  const w = Math.max(rect.w, min);
  const h = Math.max(rect.h, min);
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  return Math.abs(x - cx) <= w / 2 && Math.abs(y - cy) <= h / 2;
}

/** The cell under world point `world`. */
export function worldToCell(world: Point): Point {
  return {
    x: Math.floor(world.x / CELL_PX),
    y: Math.floor(world.y / CELL_PX),
  };
}

/**
 * How far from a thin target, in world units, a touch at `scale` still hits
 * it: half of `MIN_TOUCH_PX` on screen, and never less than `min`.
 */
export function touchReach(scale: number, min = 0): number {
  return Math.max(MIN_TOUCH_PX / 2 / scale, min);
}

/** Distance from point `p` to the segment a–b. */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t =
    len2 === 0
      ? 0
      : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Distance from point `p` to a polyline. */
export function distanceToLine(p: Point, line: readonly Point[]): number {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    best = Math.min(best, distanceToSegment(p, line[i - 1], line[i]));
  }
  return best;
}

/** The node covering world point `world`, if any. */
export function nodeAt(
  state: Readonly<GameState>,
  world: Point,
): FactoryNode | undefined {
  const { x, y } = worldToCell(world);
  for (const node of state.nodes.values()) {
    if (containsCell(nodeRect(node), x, y)) return node;
  }
  return undefined;
}

/** The revealed deposit covering world point `world`, if any. */
export function depositAt(
  state: Readonly<GameState>,
  world: Point,
): Deposit | undefined {
  const { x, y } = worldToCell(world);
  if (!isRevealed(state.map, x, y)) return undefined;
  return depositUnder(state.map, { x, y, w: 1, h: 1 });
}
