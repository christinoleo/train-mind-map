import { addCounts, type ItemCounts } from "../../data/items";
import type { Emit } from "../events";
import {
  buildPlanarIndex,
  type PlanarIndex,
  type Point,
} from "../geometry/planar";
import { pathLength, type Route } from "../geometry/route";
import { hasRails } from "../rail/rails";
import { fail, ok, type FailReason, type Result } from "../result";
import {
  checkJoins,
  checkLength,
  connectorCell,
  edgeCost,
  edgesOf,
  edgeUnits,
  findRoute,
  maxLength,
} from "../state/edges";
import type { Edge, FactoryNode, GameState } from "../state/gameState";
import type { EdgeId, NodeId } from "../state/ids";
import { checkFootprint, nodeRect } from "../state/nodes";
import { newProduction } from "../state/production";
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

/** What the edges' new lengths cost, and what their lost cells give back. */
export interface MoveCost {
  pay: ItemCounts;
  refund: ItemCounts;
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
  /** Ok when the move can be made; otherwise why not. */
  check: Result<MoveCost>;
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
 * length limit. Edges that grow pay for their new cells and edges that
 * shrink refund theirs. The undo of a move sets `undo`: an edge in its
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
  if (!node) return { node: null, edges: [], check: fail("not_found") };
  const moved: FactoryNode = { ...structuredClone(node), x, y };
  if (node.kind === "core") {
    return { node: moved, edges: [], check: fail("immovable") };
  }
  // Rails are not re-routed: a Station moves only once its rails are gone.
  if (hasRails(state, id)) {
    return { node: moved, edges: [], check: fail("has_rails") };
  }
  const attached = edgesOf(state, id);
  const fits = checkFootprint(
    withoutNode(state, id, attached),
    node.kind,
    x,
    y,
  );
  if (!fits.ok) return { node: moved, edges: [], check: fail(fits.reason) };
  // An Extractor moved onto another resource starts over on it.
  if (moved.kind === "extractor" && moved.resource !== fits.value) {
    moved.resource = fits.value!;
    moved.production = newProduction();
  }

  const nodeOf = (other: NodeId) =>
    other === id ? moved : state.nodes.get(other)!;
  let reason: FailReason | null = null;
  const edges: MovedEdge[] = [];
  const added: EdgeId[] = [];
  index.addNode(id, nodeRect(moved));
  for (const edge of attached) {
    const start = connectorCell(nodeOf(edge.from), "output", edge.fromPort);
    const end = connectorCell(nodeOf(edge.to), "input", edge.toPort);
    const given = undo?.paths.get(edge.id);
    const routed = given
      ? keptRoute(index, given, start, end)
      : findRoute(state, index, start, end);
    const path = routed.ok ? routed.value.path : null;
    const length = routed.ok ? routed.value.length : null;
    edges.push({ id: edge.id, path, length, max: maxLength(edge.level) });
    const fits = routed.ok
      ? checkLength(routed.value.length, edge.level)
      : routed;
    const refused = fits.ok ? null : fits.reason;
    reason ??= refused;
    // Later edges route around the ones already placed.
    if (path && !refused) {
      index.addEdge(edge.id, path);
      added.push(edge.id);
    }
  }
  for (const edgeId of added) index.removeEdge(edgeId);
  index.removeNode(id);
  if (reason) return { node: moved, edges, check: fail(reason) };

  const cost: MoveCost = { pay: {}, refund: {} };
  attached.forEach((edge, i) => {
    const change = edges[i].length! - pathLength(edge.path);
    const into = change > 0 ? cost.pay : cost.refund;
    addCounts(into, edgeCost(Math.abs(change), edge.level));
  });
  if (undo) cost.pay = { ...undo.charge };
  if (!canAfford(state, cost.pay)) {
    return { node: moved, edges, check: fail("no_stock") };
  }
  return { node: moved, edges, check: ok(cost) };
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
 * lost. Its undo moves the node back onto its old routes.
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
    const { node, edges, check } = this.plan(state);
    if (!node || !check.ok)
      throw new Error("MoveNode applied without validating");
    const old = state.nodes.get(this.id)!;
    const paths = new Map<EdgeId, Point[]>();
    state.nodes.set(this.id, node);
    for (const { id, path } of edges) {
      const edge = state.edges.get(id)!;
      paths.set(id, edge.path);
      const moved = { ...edge, path: path! };
      const units = edgeUnits(moved);
      moved.items = edge.items
        .filter((item) => item.pos <= units)
        .map((item) => ({ ...item, prevPos: item.pos }));
      state.edges.set(id, moved);
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
