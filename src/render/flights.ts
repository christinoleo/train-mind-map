import { Container, Graphics, Text } from "pixi.js";
import { CELL_PX, PALETTE, TAP_POP_MS } from "./theme";

interface Point {
  x: number;
  y: number;
}

/** A graphic animated from `start` for `duration` ms, then destroyed. */
interface Anim {
  gfx: Container;
  /** When it starts, in `performance.now()` ms. */
  start: number;
  duration: number;
  /**
   * Poses the graphic at progress `t`, from 0 to 1, with the camera at
   * `scale` screen pixels per world unit.
   */
  draw(t: number, scale: number): void;
  /** Its label, kept the same size on screen at any zoom. */
  label?: Text;
}

const DOT = CELL_PX * 0.35;

/** Radius of a pop's ring at its widest, in world units. */
const POP_RADIUS = CELL_PX * 0.9;

/** A label's font size, in screen pixels. */
const LABEL_PX = 13;
/** Gap between a flying dot and its label, in screen pixels. */
const LABEL_GAP_PX = 4;
/** How far a pop's label rises, in screen pixels. */
const LABEL_RISE_PX = 18;
/** How long a pop's label lingers, as a multiple of the ring's burst. */
const LABEL_LINGER = 3;

/**
 * Items flying between nodes and the map: from storage to a build site
 * (FR72), and from a tapped deposit to the Core (FR74), plus the ring that
 * bursts where a tap landed, each optionally labelled with what it carries
 * (FR150). The simulation moves items instantly; this is only the picture of
 * it, in world units.
 */
export class Flights {
  private anims: Anim[] = [];

  constructor(private readonly layer: Container) {}

  /**
   * Sends a dot of `color` from `from` to `to`, leaving at `start` and
   * landing `duration` ms later, with `label` beside it.
   */
  launch(
    from: Point,
    to: Point,
    color: number,
    start: number,
    duration: number,
    label?: string,
  ): void {
    const flight = new Container();
    flight
      .addChild(new Graphics())
      .roundRect(-DOT / 2, -DOT / 2, DOT, DOT, DOT * 0.25)
      .fill(color);
    const text = label === undefined ? undefined : labelText(label, flight);
    text?.anchor.set(0, 0.5);
    this.add(flight, start, duration, text, (t, scale) => {
      const e = easeInOut(t);
      if (text) text.x = DOT / 2 + LABEL_GAP_PX / scale;
      flight.position.set(
        from.x + (to.x - from.x) * e,
        from.y + (to.y - from.y) * e,
      );
    });
  }

  /**
   * Bursts a ring of `color` at `at`, starting at `start`, with `label`
   * rising from it.
   */
  pop(at: Point, color: number, start: number, label?: string): void {
    const pop = new Container();
    const ring = pop
      .addChild(new Graphics())
      .circle(0, 0, POP_RADIUS)
      .stroke({ color, width: CELL_PX * 0.15 });
    pop.position.set(at.x, at.y);
    const text = label === undefined ? undefined : labelText(label, pop);
    text?.anchor.set(0.5, 1);
    // The ring bursts in TAP_POP_MS; a label lingers after it.
    const linger = text ? LABEL_LINGER : 1;
    this.add(pop, start, TAP_POP_MS * linger, text, (t, scale) => {
      const e = 1 - (1 - Math.min(1, t * linger)) ** 2;
      ring.scale.set(0.3 + 0.7 * e);
      ring.alpha = 1 - e;
      if (text) {
        text.y = -POP_RADIUS - (LABEL_RISE_PX * t) / scale;
        text.alpha = Math.min(1, (1 - t) / 0.4);
      }
    });
  }

  /**
   * Poses every graphic as it is at `now`, and drops the finished ones.
   * `scale` is the camera's, in screen pixels per world unit.
   */
  update(now: number, scale: number): void {
    if (this.anims.length === 0) return;
    this.anims = this.anims.filter((a) => {
      const t = (now - a.start) / a.duration;
      if (t >= 1) {
        a.gfx.destroy({ children: true });
        return false;
      }
      a.gfx.visible = t >= 0;
      a.label?.scale.set(1 / scale);
      a.draw(Math.max(t, 0), scale);
      return true;
    });
  }

  clear(): void {
    for (const a of this.anims) a.gfx.destroy({ children: true });
    this.anims = [];
  }

  private add(
    gfx: Container,
    start: number,
    duration: number,
    label: Text | undefined,
    draw: Anim["draw"],
  ): void {
    gfx.visible = false;
    this.layer.addChild(gfx);
    this.anims.push({ gfx, start, duration, draw, label });
  }
}

/** A flight's label, sized in screen pixels, added to `parent`. */
function labelText(label: string, parent: Container): Text {
  return parent.addChild(
    new Text({
      text: label,
      style: {
        fontFamily: "system-ui, sans-serif",
        fontWeight: "700",
        fontSize: LABEL_PX,
        fill: PALETTE.text,
        stroke: { color: PALETTE.shadow, width: 3, join: "round" },
      },
    }),
  );
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}
