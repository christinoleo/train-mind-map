import { Graphics, type Container } from "pixi.js";
import { CELL_PX, TAP_POP_MS } from "./theme";

interface Point {
  x: number;
  y: number;
}

/** A graphic animated from `start` for `duration` ms, then destroyed. */
interface Anim {
  gfx: Graphics;
  /** When it starts, in `performance.now()` ms. */
  start: number;
  duration: number;
  /** Poses the graphic at progress `t`, from 0 to 1. */
  draw(t: number): void;
}

const DOT = CELL_PX * 0.35;

/** Radius of a pop's ring at its widest, in world units. */
const POP_RADIUS = CELL_PX * 0.9;

/**
 * Items flying between nodes and the map: from storage to a build site
 * (FR72), and from a tapped deposit to the Core (FR74), plus the ring that
 * bursts where a tap landed. The simulation moves items instantly; this is
 * only the picture of it, in world units.
 */
export class Flights {
  private anims: Anim[] = [];

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
    this.add(dot, start, duration, (t) => {
      const e = easeInOut(t);
      dot.position.set(
        from.x + (to.x - from.x) * e,
        from.y + (to.y - from.y) * e,
      );
    });
  }

  /** Bursts a ring of `color` at `at`, starting at `start`. */
  pop(at: Point, color: number, start: number): void {
    const ring = new Graphics()
      .circle(0, 0, POP_RADIUS)
      .stroke({ color, width: CELL_PX * 0.15 });
    ring.position.set(at.x, at.y);
    this.add(ring, start, TAP_POP_MS, (t) => {
      const e = 1 - (1 - t) ** 2;
      ring.scale.set(0.3 + 0.7 * e);
      ring.alpha = 1 - e;
    });
  }

  /** Poses every graphic as it is at `now`, and drops the finished ones. */
  update(now: number): void {
    if (this.anims.length === 0) return;
    this.anims = this.anims.filter((a) => {
      const t = (now - a.start) / a.duration;
      if (t >= 1) {
        a.gfx.destroy();
        return false;
      }
      a.gfx.visible = t >= 0;
      a.draw(Math.max(t, 0));
      return true;
    });
  }

  clear(): void {
    for (const a of this.anims) a.gfx.destroy();
    this.anims = [];
  }

  private add(
    gfx: Graphics,
    start: number,
    duration: number,
    draw: (t: number) => void,
  ): void {
    gfx.visible = false;
    this.layer.addChild(gfx);
    this.anims.push({ gfx, start, duration, draw });
  }
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}
