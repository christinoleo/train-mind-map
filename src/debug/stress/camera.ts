import type { Container } from "pixi.js";
import { clamp, type Bounds } from "./scene";

// A minimal pan and pinch camera for the stress test. It moves and scales the
// world container directly; the game's own camera lives in input/ later.

const MIN_SCALE = 0.05;
const MAX_SCALE = 8;

export class StressCamera {
  private readonly pointers = new Map<number, { x: number; y: number }>();

  constructor(
    private readonly world: Container,
    element: HTMLElement,
  ) {
    element.addEventListener("pointerdown", this.onDown);
    element.addEventListener("pointermove", this.onMove);
    element.addEventListener("pointerup", this.onUp);
    element.addEventListener("pointercancel", this.onUp);
    element.addEventListener("wheel", this.onWheel, { passive: false });
  }

  get scale(): number {
    return this.world.scale.x;
  }

  /** Centres `pixelWidth` × `pixelHeight` world pixels in the screen. */
  fit(
    pixelWidth: number,
    pixelHeight: number,
    screenW: number,
    screenH: number,
  ) {
    const scale = Math.min(screenW / pixelWidth, screenH / pixelHeight);
    this.world.scale.set(clampScale(scale));
    this.world.position.set(
      (screenW - pixelWidth * this.scale) / 2,
      (screenH - pixelHeight * this.scale) / 2,
    );
  }

  /** The visible area in world pixels. */
  viewBounds(screenW: number, screenH: number, out: Bounds): Bounds {
    const s = this.scale;
    out.minX = -this.world.x / s;
    out.minY = -this.world.y / s;
    out.maxX = (screenW - this.world.x) / s;
    out.maxY = (screenH - this.world.y) / s;
    return out;
  }

  private zoomAt(screenX: number, screenY: number, factor: number) {
    const before = this.scale;
    const after = clampScale(before * factor);
    const k = after / before;
    this.world.scale.set(after);
    this.world.x = screenX - (screenX - this.world.x) * k;
    this.world.y = screenY - (screenY - this.world.y) * k;
  }

  private readonly onDown = (e: PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };

  private readonly onMove = (e: PointerEvent) => {
    const prev = this.pointers.get(e.pointerId);
    if (!prev) return;
    const next = { x: e.clientX, y: e.clientY };
    if (this.pointers.size === 1) {
      this.world.x += next.x - prev.x;
      this.world.y += next.y - prev.y;
    } else if (this.pointers.size === 2) {
      const other = [...this.pointers.entries()].find(
        ([id]) => id !== e.pointerId,
      )![1];
      const before = Math.hypot(prev.x - other.x, prev.y - other.y);
      const after = Math.hypot(next.x - other.x, next.y - other.y);
      // Pan by half the finger's move (the midpoint's move), then zoom there.
      this.world.x += (next.x - prev.x) / 2;
      this.world.y += (next.y - prev.y) / 2;
      if (before > 0) {
        this.zoomAt(
          (next.x + other.x) / 2,
          (next.y + other.y) / 2,
          after / before,
        );
      }
    }
    this.pointers.set(e.pointerId, next);
  };

  private readonly onUp = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
  };

  private readonly onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.001));
  };
}

function clampScale(scale: number): number {
  return clamp(scale, MIN_SCALE, MAX_SCALE);
}
