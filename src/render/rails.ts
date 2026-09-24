import { Container, Graphics } from "pixi.js";
import type { NodeKind } from "../data/nodes";
import type { Point } from "../sim/geometry/planar";
import { railPorts } from "../sim/rail/station";
import type { FactoryNode, Rail } from "../sim/state/gameState";
import type { NodeId, RailId } from "../sim/state/ids";
import { cellCentre, railLine } from "./connectors";
import type { DeepReadonly } from "./readonly";
import { CATEGORY_COLOR, CELL_PX, MOVING_ALPHA, PALETTE } from "./theme";

/** Radius of a rail port's circle, in world units. */
const RAIL_PORT_R = CELL_PX * 0.26;
const RAIL_PORT_COLOR = CATEGORY_COLOR.rail;

/**
 * Draws a Station's rail ports into `g`, relative to the card's top-left
 * corner: a ring in the cell just outside each side, where its rail leaves,
 * tied to the card by a short stub. Other kinds have none.
 */
export function drawRailPorts(g: Graphics, kind: NodeKind): Graphics {
  if (kind !== "station") return g;
  for (const { side, cell } of railPorts({ kind, x: 0, y: 0 })) {
    const c = cellCentre(cell);
    const edge = side === "left" ? c.x + CELL_PX / 2 : c.x - CELL_PX / 2;
    g.moveTo(edge, c.y)
      .lineTo(c.x, c.y)
      .stroke({ color: RAIL_PORT_COLOR, width: 3 });
    g.circle(c.x, c.y, RAIL_PORT_R)
      .fill(PALETTE.ground)
      .stroke({ color: RAIL_PORT_COLOR, width: 2.5 });
    g.circle(c.x, c.y, RAIL_PORT_R * 0.35).fill(RAIL_PORT_COLOR);
  }
  return g;
}

type NodeView = DeepReadonly<FactoryNode>;

/**
 * Keeps the rail ports of every Station drawn in `layer`, the rail layer,
 * diffing the state's nodes against the drawn ones each frame.
 */
export class RailPortViews {
  private readonly views = new Map<NodeId, { node: NodeView; g: Graphics }>();

  constructor(private readonly layer: Container) {}

  /** `faded` names the node being moved, drawn faint, or none with `null`. */
  sync(nodes: ReadonlyMap<NodeId, NodeView>, faded: NodeId | null = null) {
    for (const [id, view] of this.views) {
      if (nodes.get(id) !== view.node) {
        view.g.destroy();
        this.views.delete(id);
      }
    }
    for (const [id, node] of nodes) {
      if (node.kind !== "station" || this.views.has(id)) continue;
      const g = drawRailPorts(
        new Graphics({ label: `rail-ports:${id}` }),
        node.kind,
      );
      g.position.set(node.x * CELL_PX, node.y * CELL_PX);
      this.layer.addChild(g);
      this.views.set(id, { node, g });
    }
    for (const [id, { g }] of this.views) {
      g.alpha = id === faded ? MOVING_ALPHA : 1;
    }
  }

  /** Drops every drawing, so the next `sync` draws them all again. */
  clear() {
    for (const { g } of this.views.values()) g.destroy();
    this.views.clear();
  }
}

/** Half the gap between a rail's two tracks, in cells. */
export const TRACK_SIDE = 0.17;
/** Half the gap between a rail's two tracks, in world units. */
const TRACK_GAP = CELL_PX * TRACK_SIDE;
const TRACK_WIDTH = CELL_PX * 0.07;
const TRACK_COLOR = 0xc9ced8;
/** Sleepers cross both tracks, one every `SLEEPER_STEP`. */
const SLEEPER_STEP = CELL_PX * 0.34;
const SLEEPER_HALF = CELL_PX * 0.3;
const SLEEPER_WIDTH = CELL_PX * 0.09;
const SLEEPER_COLOR = 0x7a6a58;

/** The unit normal to the left of segment a–b. */
function normal(a: Point, b: Point): Point {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: (b.y - a.y) / len, y: -(b.x - a.x) / len };
}

/**
 * `line` shifted sideways by `d`, to its left for a positive `d`, with its
 * corners mitred so the shifted line stays parallel.
 */
export function offsetLine(line: readonly Point[], d: number): Point[] {
  return line.map((p, i) => {
    const before = i > 0 ? normal(line[i - 1], p) : null;
    const after = i < line.length - 1 ? normal(p, line[i + 1]) : null;
    const n = before ?? after!;
    const m = after ?? n;
    const sum = { x: n.x + m.x, y: n.y + m.y };
    const len = Math.hypot(sum.x, sum.y) || 1;
    const mitre = { x: sum.x / len, y: sum.y / len };
    const scale = d / (mitre.x * m.x + mitre.y * m.y || 1);
    return { x: p.x + mitre.x * scale, y: p.y + mitre.y * scale };
  });
}

/**
 * Draws a double-track rail along `line` into `g` (FR80): sleepers across,
 * then the two tracks, one each way. `color` tints the tracks.
 */
function drawTrack(
  g: Graphics,
  line: readonly Point[],
  color = TRACK_COLOR,
): Graphics {
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const { x: nx, y: ny } = normal(a, b);
    for (let t = SLEEPER_STEP / 2; t < len; t += SLEEPER_STEP) {
      const cx = a.x + ((b.x - a.x) * t) / len;
      const cy = a.y + ((b.y - a.y) * t) / len;
      g.moveTo(cx - nx * SLEEPER_HALF, cy - ny * SLEEPER_HALF).lineTo(
        cx + nx * SLEEPER_HALF,
        cy + ny * SLEEPER_HALF,
      );
    }
  }
  g.stroke({ color: SLEEPER_COLOR, width: SLEEPER_WIDTH });
  if (line.length < 2) return g;
  for (const side of [-1, 1]) {
    const track = offsetLine(line, side * TRACK_GAP);
    g.moveTo(track[0].x, track[0].y);
    for (const p of track.slice(1)) g.lineTo(p.x, p.y);
    g.stroke({ color, width: TRACK_WIDTH, join: "miter" });
  }
  return g;
}

type RailView = DeepReadonly<Rail>;

/**
 * Keeps one double track per rail in `layer`, under the rail ports, diffing
 * the state's rails against the drawn ones each frame. The selected rail's
 * tracks are highlighted.
 */
export class RailViews {
  private readonly container = new Container({ label: "tracks" });
  private readonly views = new Map<
    RailId,
    { rail: RailView; selected: boolean; g: Graphics }
  >();

  constructor(layer: Container) {
    layer.addChildAt(this.container, 0);
  }

  sync(rails: ReadonlyMap<RailId, RailView>, selected: RailId | null) {
    for (const [id, view] of this.views) {
      if (rails.get(id) !== view.rail || (id === selected) !== view.selected) {
        view.g.destroy();
        this.views.delete(id);
      }
    }
    for (const [id, rail] of rails) {
      if (this.views.has(id)) continue;
      const g = drawTrack(
        new Graphics({ label: `rail:${id}` }),
        railLine(rail.path),
        id === selected ? PALETTE.output : TRACK_COLOR,
      );
      this.container.addChild(g);
      this.views.set(id, { rail, selected: id === selected, g });
    }
  }

  /** Drops every drawing, so the next `sync` draws them all again. */
  clear() {
    for (const { g } of this.views.values()) g.destroy();
    this.views.clear();
  }
}
