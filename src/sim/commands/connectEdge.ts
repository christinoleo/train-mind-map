import { EDGE_MAX_LENGTH, NEW_EDGE_LEVEL } from "../../data/edges";
import type { ItemCounts } from "../../data/items";
import type { Cost } from "../../data/nodes";
import type { Emit } from "../events";
import { buildPlanarIndex, type Point } from "../geometry/planar";
import { pathLength } from "../geometry/route";
import { fail, ok, type Result } from "../result";
import {
  checkConnectors,
  pathBounds,
  planRoute,
  priceRoute,
  reservedCells,
  type Connector,
  type EdgePlan,
} from "../state/edges";
import type { GameState } from "../state/gameState";
import { allocateId, type EdgeId } from "../state/ids";
import {
  makeRoom,
  rerouteCost,
  rerouted,
  restoreRoom,
  type Reroute,
} from "../state/reroute";
import { canAfford, debit, deposit } from "../state/stock";
import type { Command } from "./command";
import { RemoveEdge, takeOutEdge } from "./removeEdge";

/** A new edge's plan, with the existing edges it pushes aside (FR52). */
export interface ConnectPlan extends EdgePlan {
  /** Existing edges that move to make room, on their new routes. */
  moved: Reroute[];
  /** What the moved edges' lost cells give back. */
  refund: ItemCounts;
}

/**
 * Plans a new edge from output connector `from` to input connector `to`:
 * the connectors, then the automatic route, its length and its cost. When
 * other edges leave it no route, or only one too long, it moves them out of
 * the way (`makeRoom`), and it is refused only if that fails too. `index` is
 * left as it was.
 */
export function planEdge(
  state: Readonly<GameState>,
  from: Connector,
  to: Connector,
  index = buildPlanarIndex(state),
): ConnectPlan {
  const ends = checkConnectors(state, from, to, NEW_EDGE_LEVEL);
  if (!ends.ok) {
    return { route: null, check: fail(ends.reason), moved: [], refund: {} };
  }
  const { from: start, to: end } = ends.value;
  const plan = planRoute(state, index, start, end, NEW_EDGE_LEVEL);
  const stuck =
    !plan.check.ok &&
    ["no_route", "out_of_range", "crosses_edge"].includes(plan.check.reason);
  if (!stuck) return { ...plan, moved: [], refund: {} };
  const room = makeRoom(
    state,
    index,
    state.nextIds.edge as EdgeId,
    start,
    end,
    EDGE_MAX_LENGTH,
    reservedCells(state),
  );
  if (!room.ok) return { ...plan, moved: [], refund: {} };
  const { route, moved } = room.value;
  restoreRoom(state, index, moved);
  return { route, moved, ...priceEdge(state, route.length, moved) };
}

/**
 * What a new edge `length` cells long costs with the edges it moves, and
 * what their lost cells give back, or why it cannot be built: too long, or
 * the stock cannot pay (FR44, FR54).
 */
export function priceEdge(
  state: Readonly<GameState>,
  length: number,
  moved: readonly Reroute[],
): { check: Result<Cost>; refund: ItemCounts } {
  const { pay, refund } = rerouteCost(state, moved);
  return { check: priceRoute(state, length, NEW_EDGE_LEVEL, pay), refund };
}

/** What undoing a new edge needs: the moved edges' old routes and the refund taken. */
interface Built {
  id: EdgeId;
  paths: Map<EdgeId, Point[]>;
  charge: ItemCounts;
}

/**
 * Builds an edge from an output connector to an input connector along its
 * automatic route, paid per cell from the global stock (FR44, FR51–FR54).
 * One edge fits per connector. Edges moved to make room keep their items
 * and pay for, or refund, the cells they gain or lose.
 */
export class ConnectEdge implements Command {
  readonly type = "ConnectEdge";
  private built?: Built;

  constructor(
    readonly from: Connector,
    readonly to: Connector,
  ) {}

  validate(state: Readonly<GameState>): Result {
    const { check } = planEdge(state, this.from, this.to);
    return check.ok ? ok() : fail(check.reason);
  }

  apply(state: GameState, emit: Emit) {
    const { route, check, moved, refund } = planEdge(state, this.from, this.to);
    if (!route || !check.ok) {
      throw new Error("ConnectEdge applied without validating");
    }
    const id = allocateId(state.nextIds, "edge");
    const site = pathBounds(route.path);
    const paths = new Map<EdgeId, Point[]>();
    for (const m of moved) {
      const edge = state.edges.get(m.id)!;
      paths.set(m.id, edge.path);
      state.edges.set(m.id, rerouted(edge, m.path));
    }
    const charge = deposit(state, refund, site);
    const draws = debit(state, check.value, site);
    state.edges.set(id, {
      id,
      from: this.from.node,
      fromPort: this.from.port,
      to: this.to.node,
      toPort: this.to.port,
      level: NEW_EDGE_LEVEL,
      path: route.path,
      items: [],
    });
    this.built = { id, paths, charge };
    emit({ type: "ConstructionPaid", site, draws });
  }

  invert(): Command {
    if (!this.built) throw new Error("ConnectEdge was not applied");
    const { id, paths, charge } = this.built;
    return paths.size === 0
      ? new RemoveEdge(id)
      : new UnbuildEdge(id, paths, charge);
  }
}

/**
 * The undo of a `ConnectEdge` that moved other edges: it removes the new
 * edge, refunding its cost, and puts the moved edges back on their old
 * routes, taking back what their move refunded.
 */
class UnbuildEdge implements Command {
  readonly type = "UnbuildEdge";

  constructor(
    private readonly id: EdgeId,
    private readonly paths: ReadonlyMap<EdgeId, Point[]>,
    private readonly charge: ItemCounts,
  ) {}

  validate(state: Readonly<GameState>): Result {
    if (!state.edges.has(this.id)) return fail("not_found");
    const index = buildPlanarIndex(state);
    index.removeEdge(this.id);
    for (const id of this.paths.keys()) {
      if (!state.edges.has(id)) return fail("not_found");
      index.removeEdge(id);
    }
    for (const [id, path] of this.paths) {
      const clear = index.checkPath(path);
      if (!clear.ok) return clear;
      index.addEdge(id, path);
    }
    return canAfford(state, this.charge) ? ok() : fail("no_stock");
  }

  apply(state: GameState, emit: Emit) {
    const edge = state.edges.get(this.id)!;
    const site = pathBounds(edge.path);
    takeOutEdge(state, edge);
    const back = [...this.paths].map(([id, path]) => ({
      id,
      path,
      length: pathLength(path),
    }));
    const { refund } = rerouteCost(state, back);
    for (const { id, path } of back) {
      state.edges.set(
        id,
        rerouted(state.edges.get(id)!, structuredClone(path)),
      );
    }
    deposit(state, refund, site);
    const draws = debit(state, this.charge, site);
    emit({ type: "ConstructionPaid", site, draws });
  }
}
