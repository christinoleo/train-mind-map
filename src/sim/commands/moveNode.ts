import { EDGE_MAX_LENGTH } from "../../data/edges";
import type { ItemCounts } from "../../data/items";
import type { Emit } from "../events";
import {
  buildPlanarIndex,
  type PlanarIndex,
  type Point,
} from "../geometry/planar";
import { pathLength, type Route } from "../geometry/route";
import { hasRails } from "../rail/rails";
import { isStationInUse } from "../rail/trains";
import { fail, ok, type FailReason, type Result } from "../result";
import {
  checkJoins,
  checkLength,
  connectorCell,
  edgesOf,
  edgeUnits,
  findRoute,
  reservedCells,
} from "../state/edges";
import type { Edge, FactoryNode, GameState } from "../state/gameState";
import type { EdgeId, NodeId } from "../state/ids";
import type { Coverage } from "../state/map";
import { checkFootprint, nodeRect } from "../state/nodes";
import {
  makeRoom,
  rerouteCost,
  rerouted,
  restoreRoom,
  type Reroute,
  type RerouteCost,
} from "../state/reroute";
import { extractorTicks, newProduction } from "../state/production";
import { canAfford, debit, deposit } from "../state/stock";
import type { Command } from "./command";

/** An edge of a moving node, with its route from the node's new place. */
export interface MovedEdge {
  id: EdgeId;
  /** The new route, when one was found, even too long. */
  path: Point[] | null;
  /** Its length in cells, when routed, and the limit at its level. */
  length: number | null;
  max: number;
}

/** What the undo of a move puts back: the old routes and the refund taken. */
export interface MoveUndo {
  paths: ReadonlyMap<EdgeId, readonly Point[]>;
  charge: ItemCounts;
}

/** A node move checked against the state: the node at its new place and its edges. */
export interface MovePlan {
  /** The node at its new place, or `null` when there is no such node. */
  node: FactoryNode | null;
  edges: MovedEdge[];
  /** Other edges moved out of the way (FR52), by id ascending. */
  moved: Reroute[];
  /** Ok when the move can be made; otherwise why not. */
  check: Result<RerouteCost>;
}

/**
 * The planar index of `state` without node `id` and its edges: what a move
 * of that node routes through. A drag builds it once and plans every cell
 * against it.
 */
export function moveIndex(state: Readonly<GameState>, id: NodeId): PlanarIndex {
  const index = buildPlanarIndex(state);
  if (!state.nodes.has(id)) return index;
  index.removeNode(id);
  for (const edge of edgesOf(state, id)) index.removeEdge(edge.id);
  return index;
}

/**
 * Plans moving node `id` so its top-left cell sits at (x, y) (FR20): the
 * cells must be free, ignoring the node itself and its edges, and every
 * attached edge must find a route from the new place within its level's
 * length limit, moving other edges out of the way if need be (`makeRoom`).
 * Edges that grow pay for their new cells and edges that shrink refund
 * theirs. The undo of a move sets `undo`: an edge in its
 * `paths` keeps that route, if it still fits, and it pays `charge`, what
 * the move's refund found room for. `index` must come from `moveIndex`; it
 * is left as it was.
 */
export function planMove(
  state: Readonly<GameState>,
  id: NodeId,
  x: number,
  y: number,
  index = moveIndex(state, id),
  undo?: MoveUndo,
): MovePlan {
  const node = state.nodes.get(id);
  const moved = node ? { ...structuredClone(node), x, y } : null;
  const refuse = (reason: FailReason): MovePlan => ({
    node: moved,
    edges: [],
    moved: [],
    check: fail(reason),
  });
  if (!node || !moved) return refuse("not_found");
  if (node.kind === "core") return refuse("immovable");
  // Rails are not re-routed: a Station moves only once its rails are gone.
  if (hasRails(state, id)) return refuse("has_rails");
  if (isStationInUse(state, id)) return refuse("has_trains");
  const attached = edgesOf(state, id);
  const fits = checkFootprint(
    withoutNode(state, id, attached),
    node.kind,
    x,
    y,
  );
  if (!fits.ok) return refuse(fits.reason);
  // An Extractor moved onto other deposit cells starts over on them, unless
  // it still draws one and the same resource, only faster or slower.
  if (moved.kind === "extractor") {
    const coverage = fits.value!;
    const p = moved.production;
    if (!keepsMix(moved.coverage, coverage)) {
      moved.turn = 0;
      moved.production = newProduction();
    } else if (p.progress !== null) {
      // The batch under way keeps its share done, not its ticks, so a move
      // to faster cells does not finish several batches at once.
      p.progress *= extractorTicks(coverage) / extractorTicks(moved.coverage);
    }
    moved.coverage = coverage;
  }

  const nodeOf = (other: NodeId) =>
    other === id ? moved : state.nodes.get(other)!;
  let reason: FailReason | null = null;
  const edges: MovedEdge[] = [];
  const added: EdgeId[] = [];
  // Other edges moved out of the way (FR52), or, on an undo, moved back.
  const pushed = new Map<EdgeId, Reroute>();
  const pinned = new Set(attached.map((e) => e.id));
  const back = [...(undo?.paths ?? [])].filter(([e]) => !pinned.has(e));
  for (const [e] of back) index.removeEdge(e);
  const reserved = reservedCells(state, moved);
  const ends = attached.map((edge) => ({
    start: connectorCell(nodeOf(edge.from), "output", edge.fromPort),
    end: connectorCell(nodeOf(edge.to), "input", edge.toPort),
  }));
  // Edges pushed aside keep off the ends of the edges not yet placed.
  const keepOut = [...reserved, ...ends.flatMap((e) => [e.start, e.end])];
  index.addNode(id, nodeRect(moved));
  for (const [i, edge] of attached.entries()) {
    const { start, end } = ends[i];
    const given = undo?.paths.get(edge.id);
    let routed = given
      ? keptRoute(index, given, start, end)
      : findRoute(state, index, start, end, reserved);
    if (!given && !(routed.ok && routed.value.length <= EDGE_MAX_LENGTH)) {
      const room = makeRoom(state, index, edge.id, start, end, keepOut, pinned);
      if (room.ok) {
        routed = ok(room.value.route);
        for (const m of room.value.moved) pushed.set(m.id, m);
      }
    }
    const path = routed.ok ? routed.value.path : null;
    const length = routed.ok ? routed.value.length : null;
    edges.push({ id: edge.id, path, length, max: EDGE_MAX_LENGTH });
    const fits = routed.ok ? checkLength(routed.value.length) : routed;
    const refused = fits.ok ? null : fits.reason;
    reason ??= refused;
    // Later edges route around the ones already placed.
    if (path && !refused) {
      index.addEdge(edge.id, path);
      added.push(edge.id);
    }
  }
  for (const [e, path] of back) {
    const kept = state.edges.has(e)
      ? keptRoute(index, path, path[0], path[path.length - 1])
      : fail("not_found");
    if (!kept.ok) {
      reason ??= kept.reason;
      continue;
    }
    index.addEdge(e, kept.value.path);
    pushed.set(e, { id: e, ...kept.value });
  }
  for (const edgeId of added) index.removeEdge(edgeId);
  restoreRoom(state, index, pushed.values());
  for (const [e] of back) {
    if (!pushed.has(e) && state.edges.has(e)) {
      index.addEdge(e, state.edges.get(e)!.path);
    }
  }
  index.removeNode(id);
  const others = [...pushed.values()].sort((a, b) => a.id - b.id);
  if (reason) {
    return { node: moved, edges, moved: others, check: fail(reason) };
  }

  // Every edge is routed here: a missing route would have set `reason`.
  const cost = rerouteCost(state, [...(edges as Reroute[]), ...others]);
  if (undo) cost.pay = { ...undo.charge };
  if (!canAfford(state, cost.pay)) {
    return { node: moved, edges, moved: others, check: fail("no_stock") };
  }
  return { node: moved, edges, moved: others, check: ok(cost) };
}

/** `state` as it looks with node `id` and its edges lifted off the map. */
function withoutNode(
  state: Readonly<GameState>,
  id: NodeId,
  attached: readonly Edge[],
): Readonly<GameState> {
  const nodes = new Map(state.nodes);
  nodes.delete(id);
  const edges = new Map(state.edges);
  for (const edge of attached) edges.delete(edge.id);
  return { ...state, nodes, edges };
}

/** A kept route, if it still joins its connectors and crosses nothing. */
function keptRoute(
  index: PlanarIndex,
  path: readonly Point[],
  start: Point,
  end: Point,
): Result<Route> {
  const joins = checkJoins(index, path, start, end);
  if (!joins.ok) return joins;
  return ok({ path: structuredClone([...path]), length: pathLength(path) });
}

/**
 * Moves a node so its top-left cell sits at (x, y), re-routing its edges
 * (FR20). The move is refused when the cells are not free or an edge would
 * have no route or be too long. Items past the end of a shortened edge are
 * lost; other edges moved out of the way keep theirs. Its undo moves the
 * node back onto its old routes and the other edges back onto theirs.
 */
export class MoveNode implements Command {
  readonly type = "MoveNode";
  private from?: { x: number; y: number; undo: MoveUndo };

  /** `undo` is set on the undo of a move; see `planMove`. */
  constructor(
    readonly id: NodeId,
    readonly x: number,
    readonly y: number,
    private readonly undo?: MoveUndo,
  ) {}

  validate(state: Readonly<GameState>): Result {
    const { check } = this.plan(state);
    return check.ok ? ok() : fail(check.reason);
  }

  apply(state: GameState, emit: Emit) {
    const { node, edges, moved, check } = this.plan(state);
    if (!node || !check.ok)
      throw new Error("MoveNode applied without validating");
    const old = state.nodes.get(this.id)!;
    const paths = new Map<EdgeId, Point[]>();
    state.nodes.set(this.id, node);
    for (const { id, path } of edges) {
      const edge = state.edges.get(id)!;
      paths.set(id, edge.path);
      const next = { ...edge, path: path! };
      const units = edgeUnits(next);
      next.items = edge.items
        .filter((item) => item.pos <= units)
        .map((item) => ({ ...item, prevPos: item.pos }));
      state.edges.set(id, next);
    }
    for (const { id, path } of moved) {
      const edge = state.edges.get(id)!;
      paths.set(id, edge.path);
      state.edges.set(id, rerouted(edge, path));
    }
    const site = nodeRect(node);
    const charge = deposit(state, check.value.refund, site);
    this.from = { x: old.x, y: old.y, undo: { paths, charge } };
    const draws = debit(state, check.value.pay, site);
    emit({ type: "ConstructionPaid", site, draws });
  }

  invert(): Command {
    if (!this.from) throw new Error("MoveNode was not applied");
    const { x, y, undo } = this.from;
    return new MoveNode(this.id, x, y, undo);
  }

  private plan(state: Readonly<GameState>): MovePlan {
    return planMove(state, this.id, this.x, this.y, undefined, this.undo);
  }
}

/**
 * True when an Extractor moved from deposit cells `a` to `b` keeps its
 * buffers: it covers the same cells of each resource, or draws the same
 * single resource at another speed.
 */
function keepsMix(a: readonly Coverage[], b: readonly Coverage[]): boolean {
  if (a.length !== b.length) return false;
  if (a.length === 1) return a[0].resource === b[0].resource;
  return a.every(
    (part, i) => part.resource === b[i].resource && part.cells === b[i].cells,
  );
}
