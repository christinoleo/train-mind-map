import { CELL_PX } from "../../config/constants";
import { NEW_EDGE_LEVEL } from "../../data/edges";
import { ConnectEdge, planEdge } from "../../sim/commands/connectEdge";
import {
  buildPlanarIndex,
  type PlanarIndex,
  type Point,
} from "../../sim/geometry/planar";
import type { Route } from "../../sim/geometry/route";
import { fail, type FailReason, type Result } from "../../sim/result";
import {
  connectorCell,
  isConnected,
  maxLength,
  planRoute,
  priceRoute,
  type Connector,
  type ConnectorSide,
  type EdgePlan,
} from "../../sim/state/edges";
import type { Cost } from "../../data/nodes";
import type { GameState } from "../../sim/state/gameState";
import type { EdgeId } from "../../sim/state/ids";
import {
  cellCentre,
  connectorsOf,
  edgeLine,
  edgeLineOf,
} from "../../render/connectors";
import type { Camera } from "../camera";
import type { Tool } from "../controls";
import { panAtEdge, type GesturePoint } from "../gestures";
import { distanceToLine, nodeAt, touchReach, worldToCell } from "../hitTest";

/** The edge being dragged, or a moving node's edges, as the renderer draws them. */
export interface EdgePreview {
  /** The lines to draw, in world units. */
  lines: Point[][];
  /** Why the edge cannot be built here, or `null` when it can. */
  reason: FailReason | null;
  /** The route's length, when one was found, and the level's limit. */
  length: number | null;
  max: number;
  /** Where the reason chip sits, in world units. */
  tip: Point;
}

export interface ConnectToolDeps {
  state: Readonly<GameState>;
  camera: Camera;
  /** The screen size, for panning at its edges. */
  viewport(): { width: number; height: number };
  /** Validates and queues a command. */
  dispatch(command: ConnectEdge): Result;
  /** Shows the dragged edge, or hides it with `null`. */
  showPreview(preview: EdgePreview | null): void;
  /** Opens the edge menu on an edge, or closes it with `null`. */
  selectEdge(id: EdgeId | null): void;
}

interface Drag {
  from: Connector;
  /** The output connector, in world units. */
  start: Point;
  pointer: GesturePoint;
  /** The planar index, built once per drag: nothing is built meanwhile. */
  index: PlanarIndex;
  /** What the preview was last routed to; it re-routes only on a change. */
  planned: string | null;
  /** The input connector the edge would enter, if the pointer is on one. */
  target: Connector | null;
  /** The last route planned, if one was found, and its check. */
  route: Route | null;
  check: Result<Cost>;
  /** Where the dragged end sits, and the input connector it snaps to. */
  tip: Point;
  end: Point | undefined;
}

/** Nearest edge a tap still hits, at least this far, in world units. */
const EDGE_REACH = CELL_PX * 0.3;
/** Nearest connector a touch still hits, at least this far. */
const CONNECTOR_REACH = CELL_PX * 0.5;

/**
 * Connects nodes (FR51–FR53, FR59): a drag from an output connector shows the
 * automatic route live, green where releasing builds the edge and red with
 * the reason where it does not, and releasing on an input connector, or on a
 * node with a free input, builds it. Routing runs at most once per frame, and
 * only when the pointer moves to another cell or connector; the camera pans
 * while the pointer sits at the screen's edge (FR14). A tap on an edge opens
 * its menu.
 */
export class ConnectTool implements Tool {
  private drag: Drag | null = null;

  constructor(private readonly deps: ConnectToolDeps) {}

  /** Opens the menu of the edge under `p`; returns false when there is none. */
  tap(p: GesturePoint): boolean {
    const id = this.edgeAt(p);
    this.deps.selectEdge(id);
    return id !== null;
  }

  dragStart(p: GesturePoint, from: GesturePoint): boolean {
    // On a node's body only a connector close by counts, since the rest of
    // the body is for moving the node, however far the camera zooms out.
    const onBody = nodeAt(
      this.deps.state,
      this.deps.camera.toWorld(from.x, from.y),
    );
    const output = this.connectorAt(
      from,
      "output",
      onBody ? CONNECTOR_REACH : undefined,
    );
    if (!output) return false;
    const { state } = this.deps;
    const node = state.nodes.get(output.node)!;
    const start = connectorsOf(node, "output")[output.port];
    this.drag = {
      from: output,
      start,
      pointer: p,
      index: buildPlanarIndex(state),
      planned: null,
      target: null,
      route: null,
      check: fail("no_route"),
      tip: start,
      end: undefined,
    };
    this.deps.selectEdge(null);
    return true;
  }

  dragMove(p: GesturePoint) {
    if (this.drag) this.drag.pointer = p;
  }

  /** Pans at the screen's edge, then routes the preview if it moved. */
  frame(dtMs: number) {
    const { drag } = this;
    if (!drag) return;
    panAtEdge(this.deps.camera, drag.pointer, this.deps.viewport(), dtMs);
    this.plan(drag);
  }

  dragEnd(p: GesturePoint) {
    const { drag } = this;
    if (!drag) return;
    drag.pointer = p;
    this.plan(drag);
    if (drag.target && drag.check.ok) {
      this.deps.dispatch(new ConnectEdge(drag.from, drag.target));
    }
    this.cancel();
  }

  /**
   * The stock may have changed, so the preview's price is re-checked. Only
   * the stock changes during a drag, so the route stands.
   */
  refresh() {
    const { drag } = this;
    if (!drag?.route) return;
    const check = priceRoute(
      this.deps.state,
      drag.route.length,
      NEW_EDGE_LEVEL,
    );
    const was = drag.check;
    if (check.ok ? was.ok : !was.ok && was.reason === check.reason) return;
    drag.check = check;
    this.show(drag);
  }

  cancel() {
    if (!this.drag) return;
    this.drag = null;
    this.deps.showPreview(null);
  }

  private plan(drag: Drag) {
    const { state, camera } = this.deps;
    const world = camera.toWorld(drag.pointer.x, drag.pointer.y);
    const target =
      this.connectorAt(drag.pointer, "input") ?? this.inputUnder(world);
    const cell = worldToCell(world);
    const key = target
      ? `${target.node}:${target.port}`
      : `${cell.x},${cell.y}`;
    if (key === drag.planned) return;
    drag.planned = key;

    let plan: EdgePlan;
    let end: Point | undefined;
    if (target) {
      plan = planEdge(state, drag.from, target, drag.index);
      const node = state.nodes.get(target.node)!;
      end = connectorsOf(node, "input")[target.port];
    } else if (isConnected(state, "output", drag.from)) {
      plan = { route: null, check: fail("connector_taken") };
    } else {
      const node = state.nodes.get(drag.from.node)!;
      const start = connectorCell(node, "output", drag.from.port);
      plan = planRoute(state, drag.index, start, cell, NEW_EDGE_LEVEL);
      // Open ground has no input, so releasing here builds nothing.
      if (plan.check.ok) plan = { ...plan, check: fail("no_target") };
    }
    drag.target = target;
    drag.route = plan.route;
    drag.check = plan.check;
    drag.end = end;
    drag.tip = end ?? cellCentre(cell);
    this.show(drag);
  }

  private show({ start, route, check, end, tip }: Drag) {
    this.deps.showPreview({
      lines: [route ? edgeLine(start, route.path, end) : [start, tip]],
      reason: check.ok ? null : check.reason,
      length: route?.length ?? null,
      max: maxLength(NEW_EDGE_LEVEL),
      tip,
    });
  }

  /**
   * The connector on `side` nearest screen point `p`, within `reach` world
   * units, or touch reach by default.
   */
  private connectorAt(
    p: GesturePoint,
    side: ConnectorSide,
    reach = touchReach(this.deps.camera.scale, CONNECTOR_REACH),
  ): Connector | null {
    const { state, camera } = this.deps;
    const world = camera.toWorld(p.x, p.y);
    let best: Connector | null = null;
    let bestDistance = reach;
    for (const node of state.nodes.values()) {
      connectorsOf(node, side).forEach((c, port) => {
        const d = Math.hypot(c.x - world.x, c.y - world.y);
        if (d <= bestDistance) {
          best = { node: node.id, port };
          bestDistance = d;
        }
      });
    }
    return best;
  }

  /**
   * The input of the node under world point `world` that the edge would
   * enter: the nearest free one, or the nearest when all are taken.
   */
  private inputUnder(world: Point): Connector | null {
    const { state } = this.deps;
    const node = nodeAt(state, world);
    if (!node) return null;
    const inputs = connectorsOf(node, "input").map((c, port) => ({
      port,
      taken: isConnected(state, "input", { node: node.id, port }),
      distance: Math.hypot(c.x - world.x, c.y - world.y),
    }));
    inputs.sort(
      (a, b) => Number(a.taken) - Number(b.taken) || a.distance - b.distance,
    );
    return inputs.length > 0 ? { node: node.id, port: inputs[0].port } : null;
  }

  /** The edge nearest screen point `p`, within touch reach. */
  private edgeAt(p: GesturePoint): EdgeId | null {
    const { state, camera } = this.deps;
    const world = camera.toWorld(p.x, p.y);
    let best: EdgeId | null = null;
    let bestDistance = touchReach(camera.scale, EDGE_REACH);
    for (const edge of state.edges.values()) {
      const line = edgeLineOf(edge, state.nodes);
      if (!line) continue;
      const d = distanceToLine(world, line);
      if (d <= bestDistance) {
        best = edge.id;
        bestDistance = d;
      }
    }
    return best;
  }
}
