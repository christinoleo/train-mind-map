// Rip-up and re-route (FR52): when a new edge finds no route, the existing
// edges in its way step aside onto routes of their own.

import { REROUTE_MAX_EDGES } from "../../config/constants";
import { addCounts, type ItemCounts } from "../../data/items";
import { pathsTouch, type PlanarIndex, type Point } from "../geometry/planar";
import { pathLength, type Route } from "../geometry/route";
import { fail, ok, type Result } from "../result";
import { EDGE_MAX_LENGTH } from "../../data/edges";
import { edgeUnits, findRoute, lengthChangeCost } from "./edges";
import type { Edge, GameState } from "./gameState";
import type { EdgeId } from "./ids";

/** An existing edge pushed onto a new route to make room. */
export interface Reroute {
  id: EdgeId;
  path: Point[];
  length: number;
}

/** A route found by pushing other edges aside, and where they went. */
interface Room {
  route: Route;
  moved: Reroute[];
}

/**
 * Routes edge `id` from cell `from` to cell `to` within `max` cells by moving
 * the edges of `index` in its way. It finds the route the edge would take
 * if no edge but the `pinned` ones were there, lifts the edges that route
 * touches, routes the edge, then routes each lifted edge again, by id
 * ascending, within the length limit. On success the index holds the
 * moved edges on their new routes, but not edge `id`; `restoreRoom` puts it
 * back. On failure the index is left as it was and the reason is `no_route`.
 * At most `REROUTE_MAX_EDGES` edges move.
 */
export function makeRoom(
  state: Readonly<GameState>,
  index: PlanarIndex,
  id: EdgeId,
  from: Point,
  to: Point,
  max: number,
  reserved: readonly Point[],
  pinned: ReadonlySet<EdgeId> = new Set(),
): Result<Room> {
  // No route is shorter than the straight run, edges or not: skip the search.
  if (Math.abs(to.x - from.x) + Math.abs(to.y - from.y) + 1 > max) {
    return fail("no_route");
  }
  const movable = index.edgeIds().filter((e) => !pinned.has(e));
  const paths = new Map(movable.map((e) => [e, index.edgePath(e)]));
  // An edge's ends stay where they are, so no route may take them.
  const ends = [...paths.values()].flatMap((p) => [p[0], p[p.length - 1]]);
  const keepOut = [...reserved, ...ends];

  for (const e of movable) index.removeEdge(e);
  const clear = findRoute(state, index, from, to, keepOut);
  for (const e of movable) index.addEdge(e, paths.get(e)!);
  if (!clear.ok || clear.value.length > max) return fail("no_route");
  const lifted = movable.filter((e) =>
    pathsTouch(clear.value.path, paths.get(e)!),
  );
  if (lifted.length === 0 || lifted.length > REROUTE_MAX_EDGES) {
    return fail("no_route");
  }

  for (const e of lifted) index.removeEdge(e);
  const placed: EdgeId[] = [];
  const undo = () => {
    for (const e of placed) index.removeEdge(e);
    for (const e of lifted) index.addEdge(e, paths.get(e)!);
  };
  const route = findRoute(state, index, from, to, keepOut);
  if (!route.ok || route.value.length > max) {
    undo();
    return fail("no_route");
  }
  index.addEdge(id, route.value.path);
  placed.push(id);
  const moved: Reroute[] = [];
  for (const e of lifted) {
    const path = paths.get(e)!;
    const again = findRoute(
      state,
      index,
      path[0],
      path[path.length - 1],
      keepOut,
    );
    if (!again.ok || again.value.length > EDGE_MAX_LENGTH) {
      undo();
      return fail("no_route");
    }
    index.addEdge(e, again.value.path);
    placed.push(e);
    moved.push({ id: e, ...again.value });
  }
  index.removeEdge(id);
  return ok({ route: route.value, moved });
}

/** Puts each moved edge of `index` back on its route in `state`. */
export function restoreRoom(
  state: Readonly<GameState>,
  index: PlanarIndex,
  moved: Iterable<{ id: EdgeId }>,
): void {
  for (const m of moved) {
    index.removeEdge(m.id);
    index.addEdge(m.id, state.edges.get(m.id)!.path);
  }
}

/** What moving edges onto new routes costs, and what their lost cells give back. */
export interface RerouteCost {
  pay: ItemCounts;
  refund: ItemCounts;
}

/**
 * What moving each edge of `moved` off its route in `state` costs: edges that
 * grow pay for their new cells and edges that shrink refund theirs, as a
 * moving node's edges do.
 */
export function rerouteCost(
  state: Readonly<GameState>,
  moved: readonly Reroute[],
): RerouteCost {
  const cost: RerouteCost = { pay: {}, refund: {} };
  for (const { id, length } of moved) {
    const edge = state.edges.get(id)!;
    const old = pathLength(edge.path);
    addCounts(
      length > old ? cost.pay : cost.refund,
      lengthChangeCost(old, length, edge.level),
    );
  }
  return cost;
}

/**
 * Edge `edge` on route `path`, its items kept in order at the same share of
 * the way along.
 */
export function rerouted(edge: Readonly<Edge>, path: Point[]): Edge {
  const moved = { ...edge, path };
  const from = edgeUnits(edge);
  const to = edgeUnits(moved);
  moved.items = edge.items.map((item) => {
    const pos = Math.floor((item.pos * to) / from);
    return { ...item, pos, prevPos: pos };
  });
  return moved;
}
