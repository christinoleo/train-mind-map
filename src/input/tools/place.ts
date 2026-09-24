import { CELL_PX } from "../../config/constants";
import type { RawResource } from "../../data/items";
import { NODES, type NodeKind } from "../../data/nodes";
import { checkPlacement, PlaceNode } from "../../sim/commands/placeNode";
import type { FailReason, Result } from "../../sim/result";
import type { GameState } from "../../sim/state/gameState";
import { footprint } from "../../sim/state/nodes";
import { toWorld } from "../../render/theme";
import type { Camera } from "../camera";
import type { GesturePoint } from "../gestures";
import { hitsRect } from "../hitTest";
import type { Tool } from "../controls";

/** The placement preview: a node of `kind` with its top-left cell at (x, y). */
export interface Ghost {
  kind: NodeKind;
  x: number;
  y: number;
  valid: boolean;
  /** The resource an Extractor would draw from, when it sits on a deposit. */
  resource?: RawResource;
}

export interface PlaceToolDeps {
  state: Readonly<GameState>;
  camera: Camera;
  /** Validates and queues a command. */
  dispatch(command: PlaceNode): Result;
  /** Shows or hides the ghost. */
  showGhost(ghost: Ghost | null): void;
  /** Why the ghost cannot be placed where it is, or `null` when it can. */
  showHint(reason: FailReason | null): void;
}

/**
 * Places the node kind picked in the palette (FR16). A ghost card follows the
 * mouse, or the finger that drags it, green where the node fits and red where
 * it does not; a tap moves the ghost there and places the node if it fits.
 * A drag that does not start on the ghost pans the camera, and so does every
 * drag once a mouse is steering the ghost. The ghost hides on the cells just
 * built on until it moves off them.
 */
export class PlaceTool implements Tool {
  private kind: NodeKind | null = null;
  private ghost: Ghost | null = null;
  /** A mouse is steering the ghost, so no drag grabs it. */
  private followsMouse = false;
  /** Where the last node went, while the ghost still sits there. */
  private placedAt: { x: number; y: number } | null = null;

  constructor(private readonly deps: PlaceToolDeps) {}

  /** Picks `kind`, starting its ghost at the centre of the screen. */
  select(kind: NodeKind, screenCentre: GesturePoint) {
    this.kind = kind;
    this.placedAt = null;
    this.moveTo(screenCentre);
  }

  deselect() {
    this.kind = null;
    this.ghost = null;
    this.publish();
  }

  /** Re-checks the ghost against the state, which may have changed. */
  refresh() {
    if (this.ghost) this.setCell(this.ghost.x, this.ghost.y);
  }

  hover(p: GesturePoint) {
    this.followsMouse = true;
    this.moveTo(p);
  }

  tap(p: GesturePoint) {
    this.moveTo(p);
    if (!this.ghost?.valid || !this.kind) return;
    const { x, y } = this.ghost;
    const result = this.deps.dispatch(new PlaceNode(this.kind, x, y));
    if (!result.ok) {
      this.deps.showHint(result.reason);
      return;
    }
    this.placedAt = { x, y };
    this.deps.showGhost(null);
    this.deps.showHint(null);
  }

  dragStart(p: GesturePoint, from: GesturePoint): boolean {
    if (!this.ghost || this.followsMouse) return false;
    const { camera } = this.deps;
    const world = camera.toWorld(from.x, from.y);
    const { kind, x, y } = this.ghost;
    const rect = toWorld(footprint(kind, x, y));
    const onGhost = hitsRect(rect, world.x, world.y, camera.scale);
    if (onGhost) this.moveTo(p);
    return onGhost;
  }

  dragMove(p: GesturePoint) {
    this.moveTo(p);
  }

  /** A cancelled drag leaves the ghost where it is. */
  cancel() {}

  /** Centres the ghost on the cell under screen point `p`. */
  private moveTo(p: GesturePoint) {
    if (!this.kind) return;
    const world = this.deps.camera.toWorld(p.x, p.y);
    const half = NODES[this.kind].size / 2;
    const x = Math.round(world.x / CELL_PX - half);
    const y = Math.round(world.y / CELL_PX - half);
    // A mouse fires many moves per cell; `refresh` catches state changes.
    const { ghost } = this;
    if (ghost?.kind === this.kind && ghost.x === x && ghost.y === y) return;
    this.setCell(x, y);
  }

  private setCell(x: number, y: number) {
    if (!this.kind) return;
    const fits = checkPlacement(this.deps.state, this.kind, x, y);
    this.ghost = {
      kind: this.kind,
      x,
      y,
      valid: fits.ok,
      resource: fits.ok ? fits.value : undefined,
    };
    const { placedAt } = this;
    if (placedAt?.x === x && placedAt.y === y) {
      this.deps.showGhost(null);
      this.deps.showHint(null);
      return;
    }
    this.placedAt = null;
    this.publish(fits.ok ? null : fits.reason);
  }

  private publish(reason: FailReason | null = null) {
    this.deps.showGhost(this.ghost);
    this.deps.showHint(reason);
  }
}
