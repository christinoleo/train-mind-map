import { CELL_PX } from "../../config/constants";
import type { Cost } from "../../data/nodes";
import { CreateLine } from "../../sim/commands/createLine";
import { PlaceRail } from "../../sim/commands/placeRail";
import type { Point } from "../../sim/geometry/planar";
import {
  buildRailGrid,
  isPortTaken,
  planRail,
  priceRail,
  railEnds,
  railPortOf,
  routeFromPort,
  type RailGrid,
} from "../../sim/rail/rails";
import type { RailRoute } from "../../sim/rail/route";
import { railPorts } from "../../sim/rail/station";
import { fail, type FailReason, type Result } from "../../sim/result";
import type { GameState, RailEnd } from "../../sim/state/gameState";
import type { LineId, NodeId, RailId } from "../../sim/state/ids";
import { cellCentre, railLine } from "../../render/connectors";
import { vehiclePoses } from "../../render/trains";
import type { Camera } from "../camera";
import type { Tool } from "../controls";
import { panAtEdge, type GesturePoint } from "../gestures";
import { distanceToLine, nodeAt, touchReach, worldToCell } from "../hitTest";
import type { EdgePreview } from "./connect";

export interface RailToolDeps {
  state: Readonly<GameState>;
  camera: Camera;
  /** The screen size, for panning at its edges. */
  viewport(): { width: number; height: number };
  /** Validates and queues a command. */
  dispatch(command: PlaceRail | CreateLine): Result;
  /** Shows the dragged rail, or hides it with `null`. */
  showPreview(preview: EdgePreview | null): void;
  /** Opens the rail menu on a rail, or closes it with `null`. */
  selectRail(id: RailId | null): void;
  /** Opens the Line panel on a Line, or closes it with `null`. */
  selectLine(id: LineId | null): void;
  /** Shows the Station picked as a new Line's first stop, or none. */
  showPick(station: NodeId | null): void;
  /** Shows why an action was refused, for a moment. */
  showHint(reason: FailReason): void;
}

interface Drag {
  from: RailEnd;
  pointer: GesturePoint;
  /** The rail layer's obstacles, built once per drag: nothing is built meanwhile. */
  grid: RailGrid;
  /** What the preview was last routed to; it re-routes only on a change. */
  planned: string | null;
  /** The rail port the rail would reach, if the pointer is on a Station. */
  target: RailEnd | null;
  route: RailRoute | null;
  check: Result<Cost>;
  tip: Point;
}

/** Nearest rail a tap still hits, at least this far, in world units. */
const RAIL_REACH = CELL_PX * 0.4;
/** Nearest rail port a touch still hits, at least this far. */
const PORT_REACH = CELL_PX * 0.6;
/** Nearest vehicle a tap still hits, at least this far. */
const TRAIN_REACH = CELL_PX * 0.6;

/**
 * Builds rails on the rail layer (FR79–FR81): a drag from a Station's rail
 * port shows the automatic route live, green where releasing builds it and
 * red with the reason where it does not, and releasing on another Station's
 * rail port, or on the Station itself, builds it to the nearest free one.
 * The camera pans while the pointer sits at the screen's edge (FR14). A tap
 * on a train opens its Line's panel, taps on two Stations in turn create a
 * Line between them (FR95), and a tap on a rail opens its menu.
 */
export class RailTool implements Tool {
  private drag: Drag | null = null;
  /** The Station picked as a new Line's first stop. */
  private pick: NodeId | null = null;

  constructor(private readonly deps: RailToolDeps) {}

  tap(p: GesturePoint) {
    const { deps } = this;
    const world = deps.camera.toWorld(p.x, p.y);
    const line = this.lineAt(world);
    const node = line === null ? nodeAt(deps.state, world) : undefined;
    const station = node?.kind === "station" ? node.id : null;
    deps.selectLine(line);
    deps.selectRail(line === null && station === null ? this.railAt(p) : null);
    if (station !== null && this.pick !== null && station !== this.pick) {
      const result = deps.dispatch(new CreateLine([this.pick, station]));
      if (!result.ok) deps.showHint(result.reason);
      this.setPick(null);
    } else {
      // A second tap on the picked Station lets it go.
      this.setPick(station === this.pick ? null : station);
    }
  }

  dragStart(p: GesturePoint, from: GesturePoint): boolean {
    const port = this.portAt(from);
    if (!port) return false;
    this.drag = {
      from: port,
      pointer: p,
      grid: buildRailGrid(this.deps.state),
      planned: null,
      target: null,
      route: null,
      check: fail("no_route"),
      tip: this.portCentre(port)!,
    };
    this.deps.selectRail(null);
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
      this.deps.dispatch(new PlaceRail(drag.from, drag.target));
    }
    this.cancel();
  }

  /**
   * The stock may have changed, so the preview's price is re-checked. Only
   * the stock changes during a drag, so the route stands.
   */
  refresh() {
    const { drag } = this;
    if (!drag?.route || !drag.target) return;
    const was = drag.check;
    if (!was.ok && was.reason !== "no_stock") return;
    const check = priceRail(this.deps.state, drag.route.length);
    if (check.ok === was.ok) return;
    drag.check = check;
    this.show(drag);
  }

  cancel() {
    this.setPick(null);
    if (!this.drag) return;
    this.drag = null;
    this.deps.showPreview(null);
  }

  private setPick(station: NodeId | null) {
    if (station === this.pick) return;
    this.pick = station;
    this.deps.showPick(station);
  }

  /** The Line of the train nearest world point `world`, within touch reach. */
  private lineAt(world: Point): LineId | null {
    const { state, camera } = this.deps;
    let best: LineId | null = null;
    let bestDistance = touchReach(camera.scale, TRAIN_REACH);
    for (const train of state.trains.values()) {
      for (const pose of vehiclePoses(train, state.nodes, 1) ?? []) {
        const d = Math.hypot(pose.x - world.x, pose.y - world.y);
        if (d <= bestDistance) {
          best = train.line;
          bestDistance = d;
        }
      }
    }
    return best;
  }

  private plan(drag: Drag) {
    const { state, camera } = this.deps;
    const world = camera.toWorld(drag.pointer.x, drag.pointer.y);
    const target =
      this.portAt(drag.pointer, drag.from) ?? this.portUnder(world);
    const cell = worldToCell(world);
    const key = target
      ? `${target.node}:${target.port}`
      : `${cell.x},${cell.y}`;
    if (key === drag.planned) return;
    drag.planned = key;

    if (target) {
      const plan = planRail(state, drag.from, target, drag.grid);
      drag.route = plan.route;
      drag.check = plan.check;
    } else if (isPortTaken(state, drag.from)) {
      drag.route = null;
      drag.check = fail("connector_taken");
    } else {
      const { node, port } = drag.from;
      const source = railPortOf(state.nodes.get(node), port)!;
      const routed = routeFromPort(drag.grid, source, cell);
      drag.route = routed.ok ? routed.value : null;
      // Open ground has no rail port, so releasing here builds nothing.
      drag.check = fail(routed.ok ? "no_target" : routed.reason);
    }
    drag.target = target;
    drag.tip = target ? this.portCentre(target)! : cellCentre(cell);
    this.show(drag);
  }

  private show({ from, route, check, tip }: Drag) {
    const start = this.portCentre(from)!;
    this.deps.showPreview({
      lines: [route ? railLine(route.path) : [start, tip]],
      reason: check.ok ? null : check.reason,
      length: route?.length ?? null,
      max: Infinity,
      tip,
    });
  }

  /** The centre of rail port `end`'s circle, in world units. */
  private portCentre(end: RailEnd): Point | undefined {
    const port = railPortOf(this.deps.state.nodes.get(end.node), end.port);
    return port && cellCentre(port.cell);
  }

  /**
   * The rail port nearest screen point `p`, within touch reach, on any
   * Station but `except`'s.
   */
  private portAt(p: GesturePoint, except?: RailEnd): RailEnd | null {
    const { state, camera } = this.deps;
    const world = camera.toWorld(p.x, p.y);
    let best: RailEnd | null = null;
    let bestDistance = touchReach(camera.scale, PORT_REACH);
    for (const node of state.nodes.values()) {
      if (node.kind !== "station" || node.id === except?.node) continue;
      railPorts(node).forEach((port, i) => {
        const c = cellCentre(port.cell);
        const d = Math.hypot(c.x - world.x, c.y - world.y);
        if (d <= bestDistance) {
          best = { node: node.id, port: i };
          bestDistance = d;
        }
      });
    }
    return best;
  }

  /**
   * The rail port of the Station under world point `world` that the rail
   * would reach: the nearest free one, or the nearest when all are taken.
   */
  private portUnder(world: Point): RailEnd | null {
    const { state } = this.deps;
    const node = nodeAt(state, world);
    if (node?.kind !== "station" || node.id === this.drag?.from.node) {
      return null;
    }
    const ports = railPorts(node).map((port, i) => {
      const c = cellCentre(port.cell);
      return {
        port: i,
        taken: isPortTaken(state, { node: node.id, port: i }),
        distance: Math.hypot(c.x - world.x, c.y - world.y),
      };
    });
    ports.sort(
      (a, b) => Number(a.taken) - Number(b.taken) || a.distance - b.distance,
    );
    return { node: node.id, port: ports[0].port };
  }

  /** The rail nearest screen point `p`, within touch reach. */
  private railAt(p: GesturePoint): RailId | null {
    const { state, camera } = this.deps;
    const world = camera.toWorld(p.x, p.y);
    let best: RailId | null = null;
    let bestDistance = touchReach(camera.scale, RAIL_REACH);
    for (const rail of state.rails.values()) {
      if (!railEnds(rail, state.nodes)) continue;
      const line = railLine(rail.path);
      const d =
        line.length > 1
          ? distanceToLine(world, line)
          : Math.hypot(line[0].x - world.x, line[0].y - world.y);
      if (d <= bestDistance) {
        best = rail.id;
        bestDistance = d;
      }
    }
    return best;
  }
}
