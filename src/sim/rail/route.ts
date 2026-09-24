// Automatic rail routing (wayfinder #8, ADR-0007). One function serves the
// drag preview and PlaceRail, so the route the player sees is the route built.

import type { Point } from "../geometry/planar";
import { containsCell, type Rect } from "../geometry/rect";
import { fail, ok, type Result } from "../result";

/**
 * The eight headings, clockwise from east. A heading's index is its angle in
 * steps of 45°, and the fixed order breaks any tie left in the search.
 */
const HEADINGS = [
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
  { x: -1, y: 1 },
  { x: -1, y: 0 },
  { x: -1, y: -1 },
  { x: 0, y: -1 },
  { x: 1, y: -1 },
] as const;

export const EAST = 0;
export const WEST = 4;

/** A step's cost: straight 100, diagonal 141 (√2), each 45° turned 1. */
const STRAIGHT = 100;
const DIAGONAL = 141;
const TURN = 1;
/** The sharpest turn a rail takes in one cell, in 45° steps. */
const MAX_TURN = 2;

/** A found rail route: its bends as a polyline of cells, and its length. */
export interface RailRoute {
  /** The first cell, each bend, and the last cell. */
  path: Point[];
  /** The cells the rail covers, its ends included (FR45). */
  length: number;
}

/** The turn between two headings, in 45° steps, 0 to 4. */
function turn(a: number, b: number): number {
  const d = Math.abs(a - b);
  return Math.min(d, HEADINGS.length - d);
}

/**
 * The cheapest 8-direction route from cell `from`, leaving it on heading
 * `start`, to cell `to` (FR79). `blocked` marks, row by row over `bounds`,
 * the cells a rail may not use; a diagonal step also needs both cells beside
 * it free, so a rail never cuts a corner of water, a node or another rail. A
 * rail turns at most 90° per cell. With `end`, the route must reach `to`
 * able to go on along heading `end`, into the target Station.
 *
 * It is A* over (cell, heading) states: a straight step costs 100, a
 * diagonal 141, and every 45° turned 1, so among the shortest routes it takes
 * the one that turns least. Ties are broken by the state's index, so the
 * route depends only on its inputs. It fails with `out_of_bounds` when an end
 * lies outside `bounds`, and with `no_route` when no route exists.
 */
export function routeRail(
  blocked: Uint8Array,
  bounds: Readonly<Rect>,
  from: Point,
  start: number,
  to: Point,
  end: number | null,
): Result<RailRoute> {
  const { w, h } = bounds;
  if (
    !containsCell(bounds, from.x, from.y) ||
    !containsCell(bounds, to.x, to.y)
  ) {
    return fail("out_of_bounds");
  }
  const cellOf = (p: Point) => (p.y - bounds.y) * w + (p.x - bounds.x);
  const fromCell = cellOf(from);
  const toCell = cellOf(to);
  if (blocked[fromCell] || blocked[toCell]) return fail("no_route");

  const H = HEADINGS.length;
  // States are cell * 8 + heading; one more stands for having arrived.
  const done = w * h * H;
  const cost = new Int32Array(done + 1).fill(-1);
  const parent = new Int32Array(done + 1).fill(-1);
  const closed = new Uint8Array(done + 1);
  const heap = new StateHeap();
  const tx = to.x - bounds.x;
  const ty = to.y - bounds.y;
  const estimate = (cell: number) => {
    const dx = Math.abs((cell % w) - tx);
    const dy = Math.abs(((cell / w) | 0) - ty);
    const diagonal = Math.min(dx, dy);
    return DIAGONAL * diagonal + STRAIGHT * (Math.max(dx, dy) - diagonal);
  };
  const reach = (state: number, g: number, from: number, f: number) => {
    if (closed[state] || (cost[state] !== -1 && cost[state] <= g)) return;
    cost[state] = g;
    parent[state] = from;
    heap.push(f, state);
  };

  reach(fromCell * H + start, 0, -1, estimate(fromCell));
  while (heap.size > 0) {
    const state = heap.pop();
    if (closed[state]) continue;
    closed[state] = 1;
    if (state === done) break;
    const g = cost[state];
    const cell = (state / H) | 0;
    const heading = state % H;
    if (cell === toCell) {
      const last = end === null ? 0 : turn(heading, end);
      if (last <= MAX_TURN)
        reach(done, g + TURN * last, state, g + TURN * last);
    }
    const x = cell % w;
    const y = (cell / w) | 0;
    for (let d = 0; d < H; d++) {
      const turned = turn(heading, d);
      if (turned > MAX_TURN) continue;
      const { x: dx, y: dy } = HEADINGS[d];
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      const next = ny * w + nx;
      if (blocked[next]) continue;
      const diagonal = dx !== 0 && dy !== 0;
      if (diagonal && (blocked[y * w + nx] || blocked[ny * w + x])) continue;
      const g2 = g + (diagonal ? DIAGONAL : STRAIGHT) + TURN * turned;
      reach(next * H + d, g2, state, g2 + estimate(next));
    }
  }
  if (!closed[done]) return fail("no_route");

  // Walk back from the goal, keeping each cell where the heading changes.
  const cells: number[] = [];
  for (let s = parent[done]; s !== -1; s = parent[s]) cells.push(s);
  cells.reverse();
  const at = (s: number): Point => {
    const cell = (s / H) | 0;
    return { x: bounds.x + (cell % w), y: bounds.y + ((cell / w) | 0) };
  };
  const path = [at(cells[0])];
  for (let i = 1; i < cells.length - 1; i++) {
    if (cells[i] % H !== cells[i + 1] % H) path.push(at(cells[i]));
  }
  if (cells.length > 1) path.push(at(cells[cells.length - 1]));
  return ok({ path, length: cells.length });
}

/**
 * The cells a rail route covers, from its first to its last. Each of its
 * stretches runs straight or at 45°.
 */
export function railCells(path: readonly Point[]): Point[] {
  const cells = [path[0]];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const sx = Math.sign(b.x - a.x);
    const sy = Math.sign(b.y - a.y);
    const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    for (let k = 1; k <= steps; k++) {
      cells.push({ x: a.x + sx * k, y: a.y + sy * k });
    }
  }
  return cells;
}

/** A binary min-heap of states by priority, ties by the smaller state. */
class StateHeap {
  private readonly keys: number[] = [];
  private readonly states: number[] = [];

  get size() {
    return this.states.length;
  }

  push(key: number, state: number) {
    const { keys, states } = this;
    let i = states.length;
    keys.push(key);
    states.push(state);
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (!this.less(i, up)) break;
      this.swap(i, up);
      i = up;
    }
  }

  pop(): number {
    const { keys, states } = this;
    const top = states[0];
    const lastKey = keys.pop()!;
    const lastState = states.pop()!;
    if (states.length > 0) {
      keys[0] = lastKey;
      states[0] = lastState;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let min = i;
        if (l < states.length && this.less(l, min)) min = l;
        if (r < states.length && this.less(r, min)) min = r;
        if (min === i) break;
        this.swap(i, min);
        i = min;
      }
    }
    return top;
  }

  private less(i: number, j: number) {
    const { keys, states } = this;
    return keys[i] < keys[j] || (keys[i] === keys[j] && states[i] < states[j]);
  }

  private swap(i: number, j: number) {
    const { keys, states } = this;
    [keys[i], keys[j]] = [keys[j], keys[i]];
    [states[i], states[j]] = [states[j], states[i]];
  }
}
