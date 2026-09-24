import { Graphics, type Container } from "pixi.js";
import { CELL_PX, TAP_POP_MS } from "./theme";

interface Point {
  x: number;
  y: number;
}

interface Flight {
  dot: Graphics;
  from: Point;
  to: Point;
  /** When the dot leaves, in `performance.now()` ms. */
  start: number;
  duration: number;
}

/** A ring that bursts out and fades where a tap landed. */
interface Pop {
  ring: Graphics;
  start: number;
}

const DOT = CELL_PX * 0.35;

/** Radius of a pop's ring at its widest, in world units. */
const POP_RADIUS = CELL_PX * 0.9;

/**
 * Items flying between nodes and the map: from storage to a build site
 * (FR72), and from a tapped deposit to the Core (FR74). The simulation moves
 * them instantly; this is only the picture of it, in world units.
 */
export class Flights {
  private flights: Flight[] = [];
  private pops: Pop[] = [];

  constructor(private readonly layer: Container) {}

  /**
   * Sends a dot of `color` from `from` to `to`, leaving at `start` and
   * landing `duration` ms later.
   */
  launch(
    from: Point,
    to: Point,
    color: number,
    start: number,
    duration: number,
  ): void {
    const dot = new Graphics()
      .roundRect(-DOT / 2, -DOT / 2, DOT, DOT, DOT * 0.25)
      .fill(color);
    dot.visible = false;
    this.layer.addChild(dot);
    this.flights.push({ dot, from, to, start, duration });
  }

  /** Bursts a ring of `color` at `at`, starting at `start`. */
  pop(at: Point, color: number, start: number): void {
    const ring = new Graphics()
      .circle(0, 0, POP_RADIUS)
      .stroke({ color, width: CELL_PX * 0.15 });
    ring.position.set(at.x, at.y);
    ring.visible = false;
    this.layer.addChild(ring);
    this.pops.push({ ring, start });
  }

  /** Moves every dot to where it is at `now`, and drops the ones that landed. */
  update(now: number): void {
    if (this.pops.length > 0) this.updatePops(now);
    if (this.flights.length === 0) return;
    this.flights = this.flights.filter((f) => {
      const t = (now - f.start) / f.duration;
      if (t >= 1) {
        f.dot.destroy();
        return false;
      }
      f.dot.visible = t >= 0;
      const e = easeInOut(Math.max(t, 0));
      f.dot.position.set(
        f.from.x + (f.to.x - f.from.x) * e,
        f.from.y + (f.to.y - f.from.y) * e,
      );
      return true;
    });
  }

  clear(): void {
    for (const f of this.flights) f.dot.destroy();
    for (const p of this.pops) p.ring.destroy();
    this.flights = [];
    this.pops = [];
  }

  private updatePops(now: number): void {
    this.pops = this.pops.filter((p) => {
      const t = (now - p.start) / TAP_POP_MS;
      if (t >= 1) {
        p.ring.destroy();
        return false;
      }
      p.ring.visible = t >= 0;
      const e = 1 - (1 - Math.max(t, 0)) ** 2;
      p.ring.scale.set(0.3 + 0.7 * e);
      p.ring.alpha = 1 - e;
      return true;
    });
  }
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}
