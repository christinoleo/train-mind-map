import type { Point } from "../../../src/sim/geometry/planar";

/** Every cell a route's polyline runs through, as "x,y" keys. */
export function cellsOf(path: readonly Point[]): Set<string> {
  const cells = new Set<string>([`${path[0].x},${path[0].y}`]);
  for (let i = 1; i < path.length; i++) {
    const [a, b] = [path[i - 1], path[i]];
    const [dx, dy] = [Math.sign(b.x - a.x), Math.sign(b.y - a.y)];
    for (let { x, y } = a; x !== b.x || y !== b.y;) {
      x += dx;
      y += dy;
      cells.add(`${x},${y}`);
    }
  }
  return cells;
}
