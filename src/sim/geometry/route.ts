// Automatic edge routing (ADR-0007). One function serves the drag preview,
// ConnectEdge and MoveNode, so the route the player sees is the route built.

import { fail, ok, type Result } from "../result";
import { MAP_RECT } from "../state/map";
import { polylineLength, type PlanarIndex, type Point } from "./planar";
import { containsCell, type Rect } from "./rect";

/** A found route: its bends as a polyline of cells, and its length. */
export interface Route {
  /** The first cell, each bend, and the last cell. */
  path: Point[];
  /**
   * Length in cells (FR54). The edge leaves its output connector half a cell
   * before the first cell's centre and meets its input connector half a cell
   * past the last, so this is the polyline's length plus one: the number of
   * cells the edge occupies.
   */
  length: number;
}

/** Where a route may run, and how long it may be. */
export interface RouteLimits {
  /** The cells a route must stay inside; the whole map by default. */
  bounds?: Readonly<Rect>;
  /**
   * The longest route worth finding, in cells as `Route.length` counts them.
   * The search stops there, so a cap keeps a hopeless drag cheap.
   */
  maxLength?: number;
}

/**
 * The four step directions, in the fixed order ties are broken by. East comes
 * first: an edge leaves an output connector heading east and enters an input
 * connector heading east.
 */
const DIRS = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
] as const;
const EAST = 0;

const UNREACHED = -1;

/**
 * The shortest 4-direction route from cell `from` to cell `to` that stays
 * inside `bounds` and off every cell the index blocks (nodes, water, edges).
 * Among the shortest routes it takes the one with the fewest bends, counting a
 * bend where the route does not leave `from` or enter `to` heading east; any
 * tie left is broken by the fixed direction order. It fails with `no_route`
 * when no route exists, and with `out_of_range` when the shortest route is
 * longer than `maxLength`.
 *
 * It works over the cells of `bounds` in three passes: a breadth-first search
 * out from `to` counts each cell's steps to it; a pass back over the cells it
 * reached counts the fewest bends left from each, moving only one step closer
 * at a time; and a walk from `from` takes those steps.
 */
export function routeEdge(
  index: PlanarIndex,
  from: Point,
  to: Point,
  { bounds = MAP_RECT, maxLength = Infinity }: RouteLimits = {},
): Result<Route> {
  const { w, h } = bounds;
  if (
    !containsCell(bounds, from.x, from.y) ||
    !containsCell(bounds, to.x, to.y)
  ) {
    return fail("out_of_bounds");
  }

  const fromCell = (from.y - bounds.y) * w + (from.x - bounds.x);
  const toCell = (to.y - bounds.y) * w + (to.x - bounds.x);
  const blocked = index.blockedIn(bounds);
  if (blocked[fromCell] || blocked[toCell]) return fail("no_route");
  // Route.length counts one more than the steps taken.
  const field = stepsTo(toCell, fromCell, maxLength - 1, blocked, w, h);
  if (!field) return fail("out_of_range");
  const { steps, order } = field;
  if (steps[fromCell] === UNREACHED) return fail("no_route");

  // The fewest bends left from each state, a cell and the direction the
  // route entered it by, to the goal. `order` lists cells by rising steps, so
  // every cell comes after the cells one step closer to the goal.
  const togo = new Int32Array(w * h * DIRS.length);
  const closer = (cell: number, d: number) => {
    const nx = (cell % w) + DIRS[d].x;
    const ny = ((cell / w) | 0) + DIRS[d].y;
    if (nx < 0 || nx >= w || ny < 0 || ny >= h) return -1;
    const next = ny * w + nx;
    return steps[next] === steps[cell] - 1 ? next : -1;
  };
  const INF = 0x7fffffff;
  const ahead = new Int32Array(DIRS.length);
  for (const cell of order) {
    if (cell === toCell) {
      for (let dir = 0; dir < DIRS.length; dir++) {
        togo[cell * DIRS.length + dir] = dir === EAST ? 0 : 1;
      }
      continue;
    }
    // The fewest bends left after a step in each direction, and after the
    // best step whatever its direction.
    let turning = INF;
    for (let d = 0; d < DIRS.length; d++) {
      const next = closer(cell, d);
      ahead[d] = next === -1 ? INF : togo[next * DIRS.length + d];
      turning = Math.min(turning, ahead[d]);
    }
    for (let dir = 0; dir < DIRS.length; dir++) {
      togo[cell * DIRS.length + dir] = Math.min(ahead[dir], turning + 1);
    }
  }

  // Walk forward from `from`, notionally heading east, taking at each cell
  // the first direction that keeps the fewest bends, and keep the bends.
  const path = [from];
  let cell = fromCell;
  let dir = EAST;
  while (cell !== toCell) {
    const target = togo[cell * DIRS.length + dir];
    for (let d = 0; d < DIRS.length; d++) {
      const next = closer(cell, d);
      if (next === -1) continue;
      if ((d === dir ? 0 : 1) + togo[next * DIRS.length + d] !== target) {
        continue;
      }
      if (d !== dir && cell !== fromCell) {
        path.push({ x: bounds.x + (cell % w), y: bounds.y + ((cell / w) | 0) });
      }
      cell = next;
      dir = d;
      break;
    }
  }
  if (toCell !== fromCell) path.push(to);
  return ok({ path, length: polylineLength(path) + 1 });
}

/**
 * Steps from each unblocked cell to `goal`, by breadth-first search out from it,
 * and the cells in the order it reached them. It stops once it reaches
 * `stopAt`: every cell a shortest route from there can use is known by then.
 * It returns `null` once it runs past `maxSteps` without reaching `stopAt`.
 */
function stepsTo(
  goal: number,
  stopAt: number,
  maxSteps: number,
  blocked: Uint8Array,
  w: number,
  h: number,
): { steps: Int32Array; order: Int32Array } | null {
  const steps = new Int32Array(w * h).fill(UNREACHED);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;
  steps[goal] = 0;
  queue[tail++] = goal;
  while (head < tail && steps[stopAt] === UNREACHED) {
    const cell = queue[head++];
    const next = steps[cell] + 1;
    if (next > maxSteps) return null;
    const x = cell % w;
    const y = (cell / w) | 0;
    for (let d = 0; d < DIRS.length; d++) {
      const nx = x + DIRS[d].x;
      const ny = y + DIRS[d].y;
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      const n = ny * w + nx;
      if (steps[n] !== UNREACHED || blocked[n]) continue;
      steps[n] = next;
      queue[tail++] = n;
    }
  }
  return { steps, order: queue.subarray(0, tail) };
}
