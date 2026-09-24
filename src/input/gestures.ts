import {
  AUTO_PAN_EDGE_PX,
  AUTO_PAN_SPEED_PX_S,
  DRAG_THRESHOLD_PX,
  LONG_PRESS_MS,
} from "../config/constants";

/** A pointer position in screen pixels. */
export interface GesturePoint {
  x: number;
  y: number;
}

export interface GestureHandlers {
  /** One pointer went down and up without moving past the drag threshold. */
  tap(p: GesturePoint): void;
  /** One pointer stayed still for `LONG_PRESS_MS`; no tap follows. */
  longPress(p: GesturePoint): void;
  /**
   * One pointer moved past the drag threshold. `from` is where it went down;
   * `held` tells whether a long press fired first.
   */
  dragStart(p: GesturePoint, from: GesturePoint, held: boolean): void;
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

export interface Timers {
  set(callback: () => void, ms: number): number;
  clear(handle: number): void;
}

const browserTimers: Timers = {
  set: (callback, ms) => window.setTimeout(callback, ms),
  clear: (handle) => window.clearTimeout(handle),
};

type Phase =
  | "idle"
  /** One pointer is down and has not moved past the threshold yet. */
  | "pressed"
  /** The long press fired; the pointer has not moved past the threshold. */
  | "held"
  | "dragging"
  /** Two pointers went down; the camera follows until all lift. */
  | "pinching";

/**
 * Classifies raw pointer input into taps, long presses, drags and pinches
 * (architecture §Regras de gesto). Coordinates are in screen pixels.
 */
export class GestureTracker {
  private readonly pointers = new Map<number, GesturePoint>();
  private phase: Phase = "idle";
  private origin: GesturePoint = { x: 0, y: 0 };
  private timer: number | undefined;

  constructor(
    private readonly handlers: GestureHandlers,
    private readonly timers: Timers = browserTimers,
  ) {}

  down(id: number, x: number, y: number) {
    this.pointers.set(id, { x, y });
    if (this.pointers.size === 1 && this.phase === "idle") {
      this.phase = "pressed";
      this.origin = { x, y };
      this.timer = this.timers.set(() => this.onLongPress(), LONG_PRESS_MS);
    } else if (this.pointers.size === 2) {
      this.clearTimer();
      if (this.phase !== "pinching") this.handlers.cancel();
      this.phase = "pinching";
    }
  }

  move(id: number, x: number, y: number) {
    const prev = this.pointers.get(id);
    if (!prev) return;
    const next = { x, y };
    switch (this.phase) {
      case "pressed":
      case "held": {
        const moved = Math.hypot(x - this.origin.x, y - this.origin.y);
        if (moved > DRAG_THRESHOLD_PX) {
          const held = this.phase === "held";
          this.clearTimer();
          this.phase = "dragging";
          this.handlers.dragStart(next, this.origin, held);
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
    this.reset();
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

  private onLongPress() {
    this.timer = undefined;
    if (this.phase !== "pressed") return;
    this.phase = "held";
    this.handlers.longPress(this.origin);
  }

  private clearTimer() {
    if (this.timer === undefined) return;
    this.timers.clear(this.timer);
    this.timer = undefined;
  }

  private reset() {
    this.clearTimer();
    this.phase = "idle";
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

function edgeSpeed(pos: number, size: number): number {
  const band = Math.min(AUTO_PAN_EDGE_PX, size / 2);
  if (band <= 0) return 0;
  if (pos < band)
    return -AUTO_PAN_SPEED_PX_S * Math.min(1, (band - pos) / band);
  const far = size - band;
  if (pos > far) return AUTO_PAN_SPEED_PX_S * Math.min(1, (pos - far) / band);
  return 0;
}
