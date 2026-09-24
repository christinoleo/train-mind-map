// Walking along an edge's drawn line: where its items sit, and where its
// dashes fall. It has no Pixi in it, so tests cover it directly.

import { ITEMS, type ItemId } from "../data/items";
import type { Point } from "../sim/geometry/planar";
import type { Rect } from "../sim/geometry/rect";

/** A line with the distance along it to each of its points. */
export interface Polyline {
  points: readonly Point[];
  /** `lengths[i]` is the distance from `points[0]` to `points[i]`. */
  lengths: number[];
  length: number;
  /** The box around the line, for culling. */
  bounds: Rect;
}

export function measure(points: readonly Point[]): Polyline {
  const lengths = [0];
  let minX = points[0].x;
  let minY = points[0].y;
  let maxX = minX;
  let maxY = minY;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    lengths.push(lengths[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x);
    maxY = Math.max(maxY, b.y);
  }
  return {
    points,
    lengths,
    length: lengths[lengths.length - 1],
    bounds: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
  };
}

/**
 * Writes the point `distance` along `line` into `out`, clamped to its ends.
 * `hint` is a segment to start the search from: items along an edge come in
 * order, so each search starts where the last one ended. Returns the segment
 * the point is on, to pass as the next hint.
 */
export function pointAt(
  line: Polyline,
  distance: number,
  out: Point,
  hint = 1,
): number {
  const { points, lengths } = line;
  const d = Math.min(Math.max(distance, 0), line.length);
  let i = Math.min(Math.max(hint, 1), points.length - 1);
  while (i > 1 && lengths[i - 1] > d) i--;
  while (i < points.length - 1 && lengths[i] < d) i++;
  const a = points[i - 1];
  const b = points[i];
  const span = lengths[i] - lengths[i - 1];
  const t = span > 0 ? (d - lengths[i - 1]) / span : 0;
  out.x = a.x + (b.x - a.x) * t;
  out.y = a.y + (b.y - a.y) * t;
  return i;
}

/** The part of `line` from `from` to `to`, as points. */
export function slice(line: Polyline, from: number, to: number): Point[] {
  const start = { x: 0, y: 0 };
  const i = pointAt(line, from, start);
  const out = [start];
  let j = i;
  while (j < line.points.length - 1 && line.lengths[j] < to) {
    out.push(line.points[j]);
    j++;
  }
  const end = { x: 0, y: 0 };
  pointAt(line, to, end, j);
  out.push(end);
  return out;
}

/**
 * The item types in `items`, the most common first; ties keep the order of
 * `ITEMS`, so the result does not depend on where the items sit.
 */
export function itemMix(items: readonly { item: ItemId }[]): ItemId[] {
  const counts = new Map<ItemId, number>();
  for (const { item } of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return ITEMS.filter((i) => counts.has(i)).sort(
    (a, b) => counts.get(b)! - counts.get(a)!,
  );
}
