import { RAIL_CELL_COST } from "../../data/rail";
import type { Cost } from "../../data/nodes";
import { joins, type Point } from "../geometry/planar";
import { containsCell, overlaps, type Rect } from "../geometry/rect";
import { fail, ok, type FailReason, type Result } from "../result";
import type { FactoryNode, GameState, Rail, RailEnd } from "../state/gameState";
import type { NodeId } from "../state/ids";
import { ringRect, Terrain, terrainAt } from "../state/map";
import { nodeRect } from "../state/nodes";
import { canAfford } from "../state/stock";
import { EAST, railCells, routeRail, WEST, type RailRoute } from "./route";
import { railPorts, type RailPort } from "./station";

/** What `length` cells of rail cost (FR45). */
export function railCost(length: number): Cost {
  return { rail: length * RAIL_CELL_COST };
}

/** A rail's length in cells, as `RailRoute.length` counts it. */
export function railLength(path: readonly Point[]): number {
  return railCells(path).length;
}

type Placed = Pick<FactoryNode, "kind" | "x" | "y">;

/** Rail port `port` of `node`, when it is a Station that has one. */
export function railPortOf(
  node: Placed | undefined,
  port: number,
): RailPort | undefined {
  if (node?.kind !== "station") return undefined;
  return railPorts({ kind: "station", x: node.x, y: node.y })[port];
}

/** True when a rail already uses the rail port. */
export function isPortTaken(
  state: Readonly<GameState>,
  { node, port }: RailEnd,
): boolean {
  for (const rail of state.rails.values()) {
    for (const end of [rail.from, rail.to]) {
      if (end.node === node && end.port === port) return true;
    }
  }
  return false;
}

/** True when a rail leaves or reaches node `id`. */
export function hasRails(state: Readonly<GameState>, id: NodeId): boolean {
  for (const r of state.rails.values()) {
    if (r.from.node === id || r.to.node === id) return true;
  }
  return false;
}

/** The rails that leave or reach node `id`. */
export function railsOf(state: Readonly<GameState>, id: NodeId): Rail[] {
  return [...state.rails.values()].filter(
    (r) => r.from.node === id || r.to.node === id,
  );
}

/**
 * The rail layer's obstacles over the revealed area: which cells water, a
 * node or a rail occupies, row by row over `bounds`. Rails pass over edges,
 * so edges are left out (FR81).
 */
export interface RailGrid {
  bounds: Rect;
  blocked: Uint8Array;
  /** Why a rail cannot use a cell, when something occupies it. */
  reason(p: Point): FailReason | undefined;
}

/** The rail layer's obstacles in `state`. */
export function buildRailGrid(state: Readonly<GameState>): RailGrid {
  const bounds = ringRect(state.map.revealedRing);
  const { x: bx, y: by, w, h } = bounds;
  // What occupies each cell: 1 water, 2 a node, 3 a rail.
  const what = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (terrainAt(state.map, bx + x, by + y) !== Terrain.Land) {
        what[y * w + x] = 1;
      }
    }
  }
  const mark = (x: number, y: number, kind: number) => {
    if (containsCell(bounds, x, y)) what[(y - by) * w + (x - bx)] = kind;
  };
  for (const node of state.nodes.values()) {
    const r = nodeRect(node);
    if (!overlaps(r, bounds)) continue;
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) mark(x, y, 2);
    }
  }
  for (const rail of state.rails.values()) {
    for (const c of railCells(rail.path)) mark(c.x, c.y, 3);
  }
  const REASONS = [undefined, "on_water", "crosses_node", "crosses_rail"];
  return {
    bounds,
    // Any occupant blocks the cell.
    blocked: what,
    reason(p) {
      if (!containsCell(bounds, p.x, p.y)) return "out_of_bounds";
      return REASONS[what[(p.y - by) * w + (p.x - bx)]] as FailReason;
    },
  };
}

/** A rail checked against the state: its route and cost, or why it fails. */
export interface RailPlan {
  /** The automatic route, when one exists, even unaffordable. */
  route: RailRoute | null;
  /** Ok when the rail can be built; otherwise why not. */
  check: Result<Cost>;
}

/** The heading a rail leaves `port` on, away from its Station. */
function outward(port: RailPort): number {
  return port.side === "left" ? WEST : EAST;
}

/**
 * Routes a rail from rail port `from` towards cell `to`: it leaves the port
 * away from its Station and reaches `to` on heading `end`, or on any heading
 * without one, as the drag preview does before it reaches a target.
 */
export function routeFromPort(
  grid: RailGrid,
  from: RailPort,
  to: Point,
  end: number | null = null,
): Result<RailRoute> {
  const routed = routeRail(
    grid.blocked,
    grid.bounds,
    from.cell,
    outward(from),
    to,
    end,
  );
  if (routed.ok) return routed;
  return fail(grid.reason(from.cell) ?? grid.reason(to) ?? routed.reason);
}

/**
 * Plans a rail from rail port `from` to rail port `to` (FR45, FR79, FR81):
 * both are Station rail ports on different Stations and free, and the
 * automatic route between them leaves the source Station and enters the
 * target one head on. It is the one check the drag preview and `PlaceRail`
 * share, so the preview shows the rail the command builds.
 */
export function planRail(
  state: Readonly<GameState>,
  from: RailEnd,
  to: RailEnd,
  grid = buildRailGrid(state),
): RailPlan {
  const ends = checkRailEnds(state, from, to);
  if (!ends.ok) return { route: null, check: fail(ends.reason) };
  const [a, b] = ends.value;
  // It goes on into the target Station, the way it left the source.
  const routed = routeFromPort(grid, a, b.cell, (outward(b) + 4) % 8);
  if (!routed.ok) return { route: null, check: fail(routed.reason) };
  const route = routed.value;
  return { route, check: priceRail(state, route.length) };
}

/** What a rail of `length` cells costs, or `no_stock` when unaffordable. */
export function priceRail(
  state: Readonly<GameState>,
  length: number,
): Result<Cost> {
  const cost = railCost(length);
  return canAfford(state, cost) ? ok(cost) : fail("no_stock");
}

/**
 * Checks a rail's ends before routing it: both are rail ports of existing
 * Stations, on two Stations, and neither holds a rail. The node `extra`
 * counts as existing. On success it returns the two rail ports.
 */
export function checkRailEnds(
  state: Readonly<GameState>,
  from: RailEnd,
  to: RailEnd,
  extra?: FactoryNode,
): Result<[RailPort, RailPort]> {
  const nodeOf = (id: NodeId) =>
    id === extra?.id ? extra : state.nodes.get(id);
  const a = railPortOf(nodeOf(from.node), from.port);
  const b = railPortOf(nodeOf(to.node), to.port);
  if (!a || !b) return fail("not_found");
  if (from.node === to.node) return fail("same_node");
  if (isPortTaken(state, from) || isPortTaken(state, to)) {
    return fail("connector_taken");
  }
  return ok([a, b]);
}

/**
 * Checks that a removed rail can come back as it was: its Stations exist
 * (`extra` counts as existing), its rail ports are free, and its route still
 * joins them over free cells of `grid` without cutting a corner.
 */
export function checkRailRestore(
  state: Readonly<GameState>,
  rail: Readonly<Rail>,
  extra?: FactoryNode,
  grid = buildRailGrid(state),
): Result {
  const ends = checkRailEnds(state, rail.from, rail.to, extra);
  if (!ends.ok) return ends;
  const [a, b] = ends.value;
  if (!joins(rail.path, a.cell, b.cell)) return fail("no_route");
  const cells = railCells(rail.path);
  const free = (x: number, y: number) => grid.reason({ x, y }) === undefined;
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (!free(c.x, c.y)) return fail(grid.reason(c)!);
    const prev = cells[i - 1];
    if (prev && prev.x !== c.x && prev.y !== c.y) {
      if (!free(c.x, prev.y) || !free(prev.x, c.y)) return fail("no_route");
    }
  }
  return ok();
}

/** The Station `rail` leaves from and the one it reaches, as rail ports. */
export function railEnds(
  rail: Pick<Rail, "from" | "to">,
  nodes: ReadonlyMap<NodeId, Placed>,
): [RailPort, RailPort] | null {
  const a = railPortOf(nodes.get(rail.from.node), rail.from.port);
  const b = railPortOf(nodes.get(rail.to.node), rail.to.port);
  return a && b ? [a, b] : null;
}
