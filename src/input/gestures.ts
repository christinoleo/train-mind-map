import {
  AUTO_PAN_EDGE_PX,
  AUTO_PAN_SPEED_PX_S,
  DRAG_THRESHOLD_PX,
} from "../config/constants";

/** A pointer position in screen pixels. */
export interface GesturePoint {
  x: number;
  y: number;
}

export interface GestureHandlers {
  /** One pointer went down and up without moving past the drag threshold. */
  tap(p: GesturePoint): void;
  /** One pointer moved past the drag threshold. `from` is where it went down. */
  dragStart(p: GesturePoint, from: GesturePoint): void;
  dragMove(p: GesturePoint, dx: number, dy: number): void;
  dragEnd(p: GesturePoint): void;
  /**
   * A second pointer went down. Any drag in progress ends without its
   * `dragEnd`, and the active tool must cancel (FR136).
   */
  cancel(): void;
  /**
   * The pointers of a pinch moved: pan by (`dx`, `dy`) and scale by `factor`
   * around the midpoint (`x`, `y`). When one finger lifts, the other keeps
   * panning with `factor` 1 until it lifts too.
   */
  pinch(x: number, y: number, dx: number, dy: number, factor: number): void;
}

type Phase =
  | "idle"
  /** One pointer is down and has not moved past the threshold yet. */
  | "pressed"
  | "dragging"
  /** Two pointers went down; the camera follows until all lift. */
  | "pinching";

/**
 * Classifies raw pointer input into taps, drags and pinches
 * (architecture §Regras de gesto). Coordinates are in screen pixels.
 */
export class GestureTracker {
  private readonly pointers = new Map<number, GesturePoint>();
  private phase: Phase = "idle";
  private origin: GesturePoint = { x: 0, y: 0 };

  constructor(private readonly handlers: GestureHandlers) {}

  down(id: number, x: number, y: number) {
    this.pointers.set(id, { x, y });
    if (this.pointers.size === 1 && this.phase === "idle") {
      this.phase = "pressed";
      this.origin = { x, y };
    } else if (this.pointers.size === 2) {
      if (this.phase !== "pinching") this.handlers.cancel();
      this.phase = "pinching";
    }
  }

  move(id: number, x: number, y: number) {
    const prev = this.pointers.get(id);
    if (!prev) return;
    const next = { x, y };
    switch (this.phase) {
      case "pressed": {
        const moved = Math.hypot(x - this.origin.x, y - this.origin.y);
        if (moved > DRAG_THRESHOLD_PX) {
          this.phase = "dragging";
          this.handlers.dragStart(next, this.origin);
          this.handlers.dragMove(next, x - this.origin.x, y - this.origin.y);
        }
        break;
      }
      case "dragging":
        this.handlers.dragMove(next, x - prev.x, y - prev.y);
        break;
      case "pinching":
        this.pinchMove(id, prev, next);
        break;
    }
    this.pointers.set(id, next);
  }

  up(id: number) {
    this.release(id, true);
  }

  /** The browser took the pointer away: no tap, and a drag ends in place. */
  cancelPointer(id: number) {
    this.release(id, false);
  }

  private release(id: number, canTap: boolean) {
    const p = this.pointers.get(id);
    if (!p) return;
    this.pointers.delete(id);
    if (this.pointers.size > 0) return;
    if (canTap && this.phase === "pressed") this.handlers.tap(p);
    if (this.phase === "dragging") this.handlers.dragEnd(p);
    this.phase = "idle";
  }

  private pinchMove(id: number, prev: GesturePoint, next: GesturePoint) {
    const other = this.otherPointer(id);
    if (!other) {
      this.handlers.pinch(next.x, next.y, next.x - prev.x, next.y - prev.y, 1);
      return;
    }
    const before = Math.hypot(prev.x - other.x, prev.y - other.y);
    const after = Math.hypot(next.x - other.x, next.y - other.y);
    this.handlers.pinch(
      (next.x + other.x) / 2,
      (next.y + other.y) / 2,
      (next.x - prev.x) / 2,
      (next.y - prev.y) / 2,
      before > 0 && after > 0 ? after / before : 1,
    );
  }

  /** The first of the other pointers; a third finger does not steer the pinch. */
  private otherPointer(id: number): GesturePoint | undefined {
    const [a, b] = this.pointers.keys();
    if (id === a) return b === undefined ? undefined : this.pointers.get(b);
    if (id === b) return this.pointers.get(a);
    return undefined;
  }
}

/**
 * The camera velocity, in screen pixels per second, for a drag tool whose
 * pointer is at (`x`, `y`) on a `width` × `height` screen: zero away from the
 * edges, rising to `AUTO_PAN_SPEED_PX_S` at the edge itself (FR14). The
 * velocity moves the view toward the edge, so the world moves the other way.
 */
export function autoPanVelocity(
  x: number,
  y: number,
  width: number,
  height: number,
): { vx: number; vy: number } {
  return {
    vx: edgeSpeed(x, width),
    vy: edgeSpeed(y, height),
  };
}

/**
 * Pans `camera` for `dtMs` while pointer `p` sits in the band along the
 * screen's edge, so a drag reaches past it (FR14).
 */
export function panAtEdge(
  camera: { panBy(dx: number, dy: number): void },
  p: GesturePoint,
  viewport: { width: number; height: number },
  dtMs: number,
) {
  const { vx, vy } = autoPanVelocity(p.x, p.y, viewport.width, viewport.height);
  if (vx !== 0 || vy !== 0) {
    camera.panBy((-vx * dtMs) / 1000, (-vy * dtMs) / 1000);
  }
}

function edgeSpeed(pos: number, size: number): number {
  const band = Math.min(AUTO_PAN_EDGE_PX, size / 2);
  if (band <= 0) return 0;
  if (pos < band)
    return -AUTO_PAN_SPEED_PX_S * Math.min(1, (band - pos) / band);
  const far = size - band;
  if (pos > far) return AUTO_PAN_SPEED_PX_S * Math.min(1, (pos - far) / band);
  return 0;
}
