import { CELL_PX } from "../../config/constants";
import { NODES } from "../../data/nodes";
import {
  MoveNode,
  moveIndex,
  planMove,
  type MovePlan,
} from "../../sim/commands/moveNode";
import type { PlanarIndex, Point } from "../../sim/geometry/planar";
import type { FailReason, Result } from "../../sim/result";
import type { GameState } from "../../sim/state/gameState";
import type { NodeId } from "../../sim/state/ids";
import { slowedEdges } from "../../sim/state/reroute";
import { canAfford } from "../../sim/state/stock";
import { edgeLineOf, reroutedLines } from "../../render/connectors";
import type { Camera } from "../camera";
import type { Tool } from "../controls";
import { panAtEdge, type GesturePoint } from "../gestures";
import { nodeAt } from "../hitTest";
import type { EdgePreview } from "./connect";
import type { Ghost } from "./place";

export interface MoveToolDeps {
  state: Readonly<GameState>;
  camera: Camera;
  /** The screen size, for panning at its edges. */
  viewport(): { width: number; height: number };
  /** Validates and queues a command. */
  dispatch(command: MoveNode): Result;
  /** Shows the node at its new place, or hides it with `null`. */
  showGhost(ghost: Ghost | null): void;
  /** Shows the re-routed edges, or hides them with `null`. */
  showPreview(preview: EdgePreview | null): void;
  /** Fades the node being moved and its edges, or none with `null`. */
  showMoving(id: NodeId | null): void;
  /** Tells why the move was refused. */
  showHint(reason: FailReason): void;
}

interface Grab {
  id: NodeId;
  /** Where on the node it was grabbed, in cells from its top-left corner. */
  offset: Point;
  pointer: GesturePoint;
  /** The map without the node and its edges, built once per drag. */
  index: PlanarIndex;
  /** The move planned for cell (x, y); it re-plans only on a change. */
  plan: MovePlan | null;
  x: number;
  y: number;
}

/**
 * Moves a node (FR20): a drag that starts on its body carries it, snapped to
 * the cells. Every attached edge re-routes live, green while the move fits
 * and red with the reason when it does not; the camera pans while the
 * pointer sits at the screen's edge (FR14). Releasing where the move is
 * refused leaves the node where it was and tells why.
 */
export class MoveTool implements Tool {
  private grab: Grab | null = null;

  constructor(private readonly deps: MoveToolDeps) {}

  /** Takes a drag that starts on a node; a drag from the Core pans instead. */
  dragStart(p: GesturePoint, from: GesturePoint): boolean {
    const { state, camera } = this.deps;
    const world = camera.toWorld(from.x, from.y);
    const node = nodeAt(state, world);
    if (!node || node.kind === "core") return false;
    this.grab = {
      id: node.id,
      offset: {
        x: world.x / CELL_PX - node.x,
        y: world.y / CELL_PX - node.y,
      },
      pointer: p,
      index: moveIndex(state, node.id),
      plan: null,
      x: node.x,
      y: node.y,
    };
    this.deps.showMoving(node.id);
    return true;
  }

  dragMove(p: GesturePoint) {
    if (this.grab) this.grab.pointer = p;
  }

  /** Pans at the screen's edge, then re-plans the move if the cell changed. */
  frame(dtMs: number) {
    const { grab } = this;
    if (!grab) return;
    panAtEdge(this.deps.camera, grab.pointer, this.deps.viewport(), dtMs);
    this.plan();
  }

  dragEnd(p: GesturePoint) {
    const { grab } = this;
    if (!grab) return;
    grab.pointer = p;
    this.plan();
    const { plan, x, y } = grab;
    const node = this.deps.state.nodes.get(grab.id);
    this.cancel();
    if (!plan || !node || (node.x === x && node.y === y)) return;
    const result = plan.check.ok
      ? this.deps.dispatch(new MoveNode(grab.id, x, y))
      : plan.check;
    if (!result.ok) this.deps.showHint(result.reason);
  }

  /**
   * The stock may have changed. Only the stock changes during a drag, so the
   * move is planned again only when its price may pass or fail differently.
   */
  refresh() {
    const { grab } = this;
    const check = grab?.plan?.check;
    if (!grab || !check) return;
    const flips = check.ok
      ? !canAfford(this.deps.state, check.value.pay)
      : check.reason === "no_stock";
    if (!flips) return;
    grab.plan = null;
    this.plan();
  }

  cancel() {
    if (!this.grab) return;
    this.grab = null;
    this.deps.showGhost(null);
    this.deps.showPreview(null);
    this.deps.showMoving(null);
  }

  private plan() {
    const { grab } = this;
    if (!grab) return;
    const { state, camera } = this.deps;
    const world = camera.toWorld(grab.pointer.x, grab.pointer.y);
    const x = Math.round(world.x / CELL_PX - grab.offset.x);
    const y = Math.round(world.y / CELL_PX - grab.offset.y);
    if (grab.plan && x === grab.x && y === grab.y) return;
    grab.x = x;
    grab.y = y;
    const plan = planMove(state, grab.id, x, y, grab.index);
    grab.plan = plan;
    this.show(plan);
  }

  private show({ node, edges, moved, check }: MovePlan) {
    if (!node) return;
    const { state } = this.deps;
    this.deps.showGhost({
      kind: node.kind,
      x: node.x,
      y: node.y,
      valid: check.ok,
      // A refused move has not worked out the cells under the new spot.
      coverage:
        check.ok && node.kind === "extractor" ? node.coverage : undefined,
    });
    const nodes = new Map(state.nodes).set(node.id, node);
    const lines: Point[][] = [];
    for (const { id, path } of edges) {
      const edge = state.edges.get(id)!;
      // An edge with no route is drawn straight across, in red.
      const line = edgeLineOf({ ...edge, path: path ?? [] }, nodes);
      if (line) lines.push(line);
    }
    const tooLong = edges.find((e) => e.length !== null && e.length > e.max);
    this.deps.showPreview({
      lines,
      moved: reroutedLines(moved, state.edges, nodes),
      slowed: slowedEdges(state, [...edges, ...moved]),
      reason: check.ok ? null : check.reason,
      length: tooLong?.length ?? null,
      max: tooLong?.max ?? 0,
      tip: {
        x: (node.x + NODES[node.kind].size / 2) * CELL_PX,
        y: node.y * CELL_PX,
      },
    });
  }
}
