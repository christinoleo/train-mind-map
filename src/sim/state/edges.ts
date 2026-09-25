import { FLOW_UNITS_PER_CELL } from "../../config/constants";
import {
  EDGE_CELL_COST,
  EDGE_DISTANCE_STEP,
  EDGE_MAX_LENGTH,
  EDGE_THROUGHPUT,
  ITEM_SPEED,
  type EdgeLevel,
} from "../../data/edges";
import {
  addCounts,
  countsAbove,
  itemEntries,
  type ItemCounts,
} from "../../data/items";
import { NODES, type Cost } from "../../data/nodes";
import {
  joins,
  segmentHitsRect,
  segments,
  type PlanarIndex,
  type Point,
} from "../geometry/planar";
import type { Rect } from "../geometry/rect";
import { pathLength, routeEdge, type Route } from "../geometry/route";
import { fail, ok, type Result } from "../result";
import type { Edge, FactoryNode, GameState } from "./gameState";
import type { NodeId } from "./ids";
import { ringRect } from "./map";
import { canFeed, inputTypes, type Typed } from "./production";
import { canAfford } from "./stock";

export type ConnectorSide = "input" | "output";

/** One end of an edge: a node's input or output connector. */
export interface Connector {
  node: NodeId;
  /** Which of the node's inputs or outputs, counted from the top. */
  port: number;
}

/**
 * The row, counted from a node's top, of each of `count` connectors on a side
 * `size` cells tall (FR15). An edge leaves or enters a connector through the
 * cell beside its row, so connectors keep to the body below the header row
 * while they fit there, and spread over the whole side when they do not.
 * Every node is at least as tall as its connectors on a side (see
 * `NODE_SIZE`), so each connector has a row of its own.
 */
export function connectorRows(count: number, size: number): number[] {
  return count < size
    ? spreadRows(count, size - 1).map((row) => row + 1)
    : spreadRows(count, size);
}

/** `count` rows spread evenly over `size` rows, counted from the first. */
export function spreadRows(count: number, size: number): number[] {
  return Array.from({ length: count }, (_, i) =>
    Math.floor(((i + 0.5) * size) / count),
  );
}

/**
 * How many connectors `node` has on `side`. A production node's inputs come
 * from its recipe (FR25); every other count comes from its kind.
 */
export function connectorCount(node: Typed, side: ConnectorSide): number {
  return side === "input" ? inputTypes(node).length : NODES[node.kind].outputs;
}

/**
 * The cell just outside a connector, where an edge's route starts (an
 * output, on the node's right) or ends (an input, on its left).
 */
export function connectorCell(
  node: Typed & Pick<FactoryNode, "x" | "y">,
  side: ConnectorSide,
  port: number,
): Point {
  const { size } = NODES[node.kind];
  const row = connectorRows(connectorCount(node, side), size)[port];
  return {
    x: side === "output" ? node.x + size : node.x - 1,
    y: node.y + row,
  };
}

/**
 * How many cells' worth of base cost `length` cells of edge come to: cell i,
 * counted from 1, weighs 2^⌊(i−1)/EDGE_DISTANCE_STEP⌋, so with a step of 12
 * cells 1–12 weigh 1, 13–24 weigh 2, 25–36 weigh 4 (FR54).
 */
export function costWeight(length: number): number {
  const factor = distanceFactor(length);
  const rest = length % EDGE_DISTANCE_STEP;
  return EDGE_DISTANCE_STEP * (factor - 1) + rest * factor;
}

/** What `length` cells of edge at `level` cost (FR44, FR54). */
export function edgeCost(length: number, level: EdgeLevel): Cost {
  return scale(EDGE_CELL_COST[level - 1], costWeight(length));
}

/**
 * What an edge at `level` pays for growing from `from` cells to `to`, or
 * gets back for shrinking: the cells it gains or loses, each at its own
 * weight (FR54).
 */
export function lengthChangeCost(
  from: number,
  to: number,
  level: EdgeLevel,
): Cost {
  return scale(
    EDGE_CELL_COST[level - 1],
    Math.abs(costWeight(to) - costWeight(from)),
  );
}

/**
 * What raising `length` cells of edge from level `from` to `to` costs (FR58):
 * the difference, cell by cell.
 */
export function upgradeCost(
  length: number,
  from: EdgeLevel,
  to: EdgeLevel,
): Cost {
  return scale(
    countsAbove(EDGE_CELL_COST[from - 1], EDGE_CELL_COST[to - 1]),
    costWeight(length),
  );
}

/**
 * Items per second an edge `length` cells long at `level` carries: the
 * level's throughput, halved every `EDGE_DISTANCE_STEP` cells (FR54, FR55).
 */
export function edgeThroughput(length: number, level: EdgeLevel): number {
  return EDGE_THROUGHPUT[level - 1] / distanceFactor(length);
}

/** 2^⌊length/EDGE_DISTANCE_STEP⌋: how many times over distance divides an edge's throughput. */
function distanceFactor(length: number): number {
  return 2 ** Math.floor(length / EDGE_DISTANCE_STEP);
}

function scale(cost: Cost, factor: number): Cost {
  const out: ItemCounts = {};
  for (const [item, count] of itemEntries(cost)) out[item] = count * factor;
  return out;
}

/** The cells an edge's route spans, as a rect: its site for the stock. */
export function pathBounds(path: readonly Point[]): Rect {
  const xs = path.map((p) => p.x);
  const ys = path.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x + 1, h: Math.max(...ys) - y + 1 };
}

/** True when an edge's route runs through a cell of `rect`. */
export function edgeCrosses(state: Readonly<GameState>, rect: Rect): boolean {
  for (const edge of state.edges.values()) {
    if (edgeHitsRect(edge, rect)) return true;
  }
  return false;
}

/** True when `edge`'s route runs through a cell of `rect`. */
export function edgeHitsRect(edge: Readonly<Edge>, rect: Rect): boolean {
  return segments(edge.path).some(([a, b]) => segmentHitsRect(a, b, rect));
}

/** The edges that leave or enter node `id`. */
export function edgesOf(state: Readonly<GameState>, id: NodeId): Edge[] {
  return [...state.edges.values()].filter((e) => e.from === id || e.to === id);
}

/** True when an edge already uses the connector. */
export function isConnected(
  state: Readonly<GameState>,
  side: ConnectorSide,
  { node, port }: Connector,
): boolean {
  for (const e of state.edges.values()) {
    const [id, p] = side === "output" ? [e.from, e.fromPort] : [e.to, e.toPort];
    if (id === node && p === port) return true;
  }
  return false;
}

/**
 * The cells in front of every free connector (FR52), which other edges' routes
 * leave open so no route runs flush against a connector an edge may still
 * use. A connector that has an edge releases its cell. `moved` stands in for
 * the node of the same id, at the place it is moving to.
 */
export function reservedCells(
  state: Readonly<GameState>,
  moved?: FactoryNode,
): Point[] {
  const taken = new Set<string>();
  for (const e of state.edges.values()) {
    taken.add(`output:${e.from}:${e.fromPort}`);
    taken.add(`input:${e.to}:${e.toPort}`);
  }
  const cells: Point[] = [];
  for (const stored of state.nodes.values()) {
    const node = stored.id === moved?.id ? moved : stored;
    for (const side of ["output", "input"] as const) {
      for (let port = 0; port < connectorCount(node, side); port++) {
        if (taken.has(`${side}:${node.id}:${port}`)) continue;
        cells.push(connectorCell(node, side, port));
      }
    }
  }
  return cells;
}

/** An edge route checked against a level: what it costs, or why it fails. */
export interface EdgePlan {
  /** The automatic route, when one exists, even too long or unaffordable. */
  route: Route | null;
  /** Ok when the edge can be built; otherwise why not. */
  check: Result<Cost>;
}

/** Checks `length` cells of edge against the length limit (FR54). */
export function checkLength(length: number): Result {
  return length > EDGE_MAX_LENGTH ? fail("out_of_range") : ok();
}

/**
 * Checks `length` cells of edge at `level` against the length limit and the
 * stock: what it costs, with `extra` on top, or why it cannot be built
 * (FR44, FR54).
 */
export function priceRoute(
  state: Readonly<GameState>,
  length: number,
  level: EdgeLevel,
  extra: Readonly<ItemCounts> = {},
): Result<Cost> {
  const fits = checkLength(length);
  if (!fits.ok) return fits;
  const cost = addCounts(edgeCost(length, level), extra);
  return canAfford(state, cost) ? ok(cost) : fail("no_stock");
}

/**
 * Routes an edge from cell `from` to cell `to` inside the revealed area and
 * checks it for `level`: the length limit and the stock (FR44, FR52–FR54).
 * A route blocked at either end reports what blocks it. It is the one check
 * the drag preview and `ConnectEdge` share, so the preview shows the edge the
 * command builds.
 */
export function planRoute(
  state: Readonly<GameState>,
  index: PlanarIndex,
  from: Point,
  to: Point,
  level: EdgeLevel,
): EdgePlan {
  const routed = findRoute(state, index, from, to);
  if (!routed.ok) return { route: null, check: fail(routed.reason) };
  const route = routed.value;
  return { route, check: priceRoute(state, route.length, level) };
}

/**
 * The automatic route from cell `from` to cell `to` inside the revealed
 * area, whatever its length, clear of the `reserved` cells (by default
 * those in front of free connectors; see `reservedCells`). A route blocked at
 * either end reports what blocks it.
 */
export function findRoute(
  state: Readonly<GameState>,
  index: PlanarIndex,
  from: Point,
  to: Point,
  reserved: readonly Point[] = reservedCells(state),
): Result<Route> {
  const routed = routeEdge(index, from, to, {
    bounds: ringRect(state.map.revealedRing),
    reserved,
  });
  if (routed.ok) return routed;
  return fail(
    blockedEnd(index, from) ?? blockedEnd(index, to) ?? routed.reason,
  );
}

/** Why an edge cannot use `cell`, if something occupies it. */
function blockedEnd(index: PlanarIndex, cell: Point) {
  const o = index.obstacleAt(cell.x, cell.y);
  if (!o) return undefined;
  if (o.kind === "edge") return "crosses_edge";
  return o.kind === "node" ? "crosses_node" : "on_water";
}

/**
 * The input port of `node` an edge from `source` ending at `cell` would sit
 * on: the first one not in `taken` that takes what the source sends and
 * whose connector is `cell`, or -1 when none does (FR25).
 */
export function matchInputPort(
  node: Typed & Pick<FactoryNode, "x" | "y">,
  source: FactoryNode,
  cell: Point,
  taken: ReadonlySet<number>,
): number {
  return inputTypes(node).findIndex((type, port) => {
    if (taken.has(port) || !canFeed(source, type)) return false;
    const at = connectorCell(node, "input", port);
    return at.x === cell.x && at.y === cell.y;
  });
}

/**
 * Checks an edge between two connectors, before routing it: both exist, they
 * belong to different nodes, neither is taken, the source can send what the
 * input takes (FR25), and research has unlocked `level`. On success it
 * returns the cells the route runs between.
 */
export function checkConnectors(
  state: Readonly<GameState>,
  from: Connector,
  to: Connector,
  level: EdgeLevel,
): Result<{ from: Point; to: Point }> {
  const out = state.nodes.get(from.node);
  const into = state.nodes.get(to.node);
  if (!out || !into) return fail("not_found");
  if (!hasPort(out, "output", from.port) || !hasPort(into, "input", to.port)) {
    return fail("not_found");
  }
  if (from.node === to.node) return fail("same_node");
  if (isConnected(state, "output", from) || isConnected(state, "input", to)) {
    return fail("connector_taken");
  }
  if (!canFeed(out, inputTypes(into)[to.port])) return fail("wrong_item");
  if (level > state.edgeLevel) return fail("locked");
  return ok({
    from: connectorCell(out, "output", from.port),
    to: connectorCell(into, "input", to.port),
  });
}

function hasPort(node: FactoryNode, side: ConnectorSide, port: number) {
  return (
    Number.isInteger(port) && port >= 0 && port < connectorCount(node, side)
  );
}

/**
 * Checks that a removed edge can come back as it was: its nodes exist (the
 * node `extra` counts as existing), its connectors are free, its route still
 * joins them and it crosses nothing in `index`.
 */
export function checkRestore(
  state: Readonly<GameState>,
  index: PlanarIndex,
  edge: Readonly<Edge>,
  extra?: FactoryNode,
): Result {
  const nodeOf = (id: NodeId) =>
    id === extra?.id ? extra : state.nodes.get(id);
  const out = nodeOf(edge.from);
  const into = nodeOf(edge.to);
  if (!out || !into) return fail("not_found");
  const from = { node: edge.from, port: edge.fromPort };
  const to = { node: edge.to, port: edge.toPort };
  if (isConnected(state, "output", from) || isConnected(state, "input", to)) {
    return fail("connector_taken");
  }
  const start = connectorCell(out, "output", edge.fromPort);
  const end = connectorCell(into, "input", edge.toPort);
  return checkJoins(index, edge.path, start, end);
}

/** Checks that a kept route still runs from `start` to `end` and crosses nothing. */
export function checkJoins(
  index: PlanarIndex,
  path: readonly Point[],
  start: Point,
  end: Point,
): Result {
  if (!joins(path, start, end)) return fail("no_route");
  return index.checkPath(path);
}

/**
 * Least flow units between two items on `edge`: speed ÷ effective
 * throughput, which caps the edge at that throughput (FR54, FR55).
 */
export function spacingUnits(edge: {
  readonly path: readonly Point[];
  readonly level: EdgeLevel;
}): number {
  return (
    (ITEM_SPEED * FLOW_UNITS_PER_CELL) /
    edgeThroughput(pathLength(edge.path), edge.level)
  );
}

/** An edge's length in flow units: from its output connector to its input. */
export function edgeUnits(edge: { readonly path: readonly Point[] }): number {
  return pathLength(edge.path) * FLOW_UNITS_PER_CELL;
}

/**
 * True when an edge is full (FR57): its front item waits at a node that
 * refuses it, and the queue behind has backed up to the output connector.
 */
export function isEdgeFull(edge: Readonly<Edge>): boolean {
  const front = edge.items[0];
  const back = edge.items[edge.items.length - 1];
  return front?.pos === edgeUnits(edge) && back.pos < spacingUnits(edge);
}
