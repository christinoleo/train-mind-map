import { Graphics, type Container } from "pixi.js";
import { BUILD_FLIGHT_MS, CELL_PX } from "./theme";

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
}

const DOT = CELL_PX * 0.35;

/**
 * Items flying from storage to a build site (FR72). The simulation moves them
 * instantly; this is only the picture of it, in world units.
 */
export class Flights {
  private flights: Flight[] = [];

  constructor(private readonly layer: Container) {}

  /** Sends a dot of `color` from `from` to `to`, leaving at `start`. */
  launch(from: Point, to: Point, color: number, start: number): void {
    const dot = new Graphics()
      .roundRect(-DOT / 2, -DOT / 2, DOT, DOT, DOT * 0.25)
      .fill(color);
    dot.visible = false;
    this.layer.addChild(dot);
    this.flights.push({ dot, from, to, start });
  }

  /** Moves every dot to where it is at `now`, and drops the ones that landed. */
  update(now: number): void {
    if (this.flights.length === 0) return;
    this.flights = this.flights.filter((f) => {
      const t = (now - f.start) / BUILD_FLIGHT_MS;
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
    this.flights = [];
  }
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}
