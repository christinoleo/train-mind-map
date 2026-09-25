import type { Point } from "../../sim/geometry/planar";
import type { GameState } from "../../sim/state/gameState";
import type { NodeId } from "../../sim/state/ids";
import type { Deposit } from "../../sim/state/map";
import type { Camera } from "../camera";
import type { Tool } from "../controls";
import type { GesturePoint } from "../gestures";
import { depositAt, nodeAt } from "../hitTest";
import type { ConnectTool } from "./connect";
import type { MoveTool } from "./move";
import type { TapTool } from "./tap";

export interface BuildToolDeps {
  state: Readonly<GameState>;
  camera: Camera;
  tapTool: TapTool;
  connectTool: ConnectTool;
  moveTool: MoveTool;
  /** The node whose action bubble is open, if any. */
  selectedNode(): NodeId | null;
  /** Opens node `id`'s action bubble, closing any other. */
  selectNode(id: NodeId): void;
  /** Closes the node and edge action bubbles. */
  deselect(): void;
  /** Names the deposit under the mouse or the last tap, or none with `null`. */
  showDepositName(deposit: Deposit | null): void;
}

/**
 * The factory layer's tool while nothing is being placed (FR19, FR20,
 * FR59, FR133–FR135). Tap selects: a tap on a node or an edge opens its
 * action bubble, a tap on an Extractor whose bubble is open, or on the
 * ground, mines by hand, and a tap on empty map closes the bubble. Drag
 * acts: a drag from an output connector connects, a drag from a node's body
 * lifts and moves it, and any other drag pans. Every drag closes the bubble.
 * A deposit under the mouse or the last tap shows its resource's name (FR150).
 */
export class BuildTool implements Tool {
  constructor(private readonly deps: BuildToolDeps) {}

  hover(p: GesturePoint) {
    this.nameDepositAt(this.deps.camera.toWorld(p.x, p.y));
  }

  tap(p: GesturePoint) {
    const { deps } = this;
    const node = this.nameDepositAt(deps.camera.toWorld(p.x, p.y));
    // Extractors can cover a whole deposit: a tap on one whose bubble is
    // open already mines the deposit under it.
    if (node?.kind === "extractor" && node.id === deps.selectedNode()) {
      deps.tapTool.tap(p);
    } else if (node) {
      deps.selectNode(node.id);
    } else {
      deps.deselect();
      if (!deps.connectTool.tap(p)) deps.tapTool.tap(p);
    }
  }

  dragStart(p: GesturePoint, from: GesturePoint): boolean {
    const { deps } = this;
    deps.deselect();
    // The connector comes first: it sits on the edge of the node's body.
    return (
      deps.connectTool.dragStart(p, from) || deps.moveTool.dragStart(p, from)
    );
  }

  dragMove(p: GesturePoint) {
    this.deps.moveTool.dragMove(p);
    this.deps.connectTool.dragMove(p);
  }

  dragEnd(p: GesturePoint) {
    this.deps.moveTool.dragEnd(p);
    this.deps.connectTool.dragEnd(p);
  }

  frame(dtMs: number) {
    this.deps.moveTool.frame(dtMs);
    this.deps.connectTool.frame(dtMs);
  }

  refresh() {
    this.deps.tapTool.refresh();
    this.deps.moveTool.refresh();
    this.deps.connectTool.refresh();
  }

  cancel() {
    this.deps.showDepositName(null);
    this.deps.tapTool.cancel();
    this.deps.moveTool.cancel();
    this.deps.connectTool.cancel();
  }

  /** Names the deposit at `world` unless a node covers it; returns the node. */
  private nameDepositAt(world: Point) {
    const node = nodeAt(this.deps.state, world);
    this.deps.showDepositName(
      node ? null : (depositAt(this.deps.state, world) ?? null),
    );
    return node;
  }
}
