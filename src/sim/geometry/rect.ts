/** An axis-aligned block of cells: top-left cell, width and height. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** True when `test` holds for every cell of `rect`. */
export function allCells(
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

/** True when the rects overlap, or come within `gap` cells of each other. */
export function overlaps(a: Rect, b: Rect, gap = 0): boolean {
  return (
    a.x < b.x + b.w + gap &&
    b.x < a.x + a.w + gap &&
    a.y < b.y + b.h + gap &&
    b.y < a.y + a.h + gap
  );
}

/** True when cell (x, y) lies inside `rect`. */
export function containsCell(rect: Rect, x: number, y: number): boolean {
  return (
    x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h
  );
}

/** True when `inner` lies wholly inside `outer`. */
export function containsRect(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}

/** The shortest distance between two rects, in cells; 0 when they touch. */
export function rectDistance(a: Rect, b: Rect): number {
  const dx = Math.max(0, b.x - (a.x + a.w), a.x - (b.x + b.w));
  const dy = Math.max(0, b.y - (a.y + a.h), a.y - (b.y + b.h));
  // Math.sqrt is exactly rounded on every engine, unlike Math.hypot, so the
  // same seed gives the same map on every device.
  return Math.sqrt(dx * dx + dy * dy);
}
