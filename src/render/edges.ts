import { Container, Graphics, Text } from "pixi.js";
import type { Point } from "../sim/geometry/planar";
import type { Edge, FactoryNode } from "../sim/state/gameState";
import type { EdgeId, NodeId } from "../sim/state/ids";
import { ITEMS, type ItemId } from "../data/items";
import type { Camera, Lod } from "../input/camera";
import type { EdgePreview } from "../input/tools/connect";
import { edgeReasonText, edgeStatsText } from "../ui/format";
import { strings } from "../ui/strings";
import { edgeLineOf } from "./connectors";
import { itemMix, measure, slice, type Polyline } from "./polyline";
import type { DeepReadonly } from "./readonly";
import {
  CELL_PX,
  GHOST_COLOR,
  REROUTE_COLOR,
  ITEM_COLOR,
  MOVING_ALPHA,
  PALETTE,
} from "./theme";

/** Width of an edge's stroke, in world units. */
const EDGE_WIDTH = CELL_PX * 0.28;
/** How far above its anchor the reason chip floats, in screen pixels. */
const CHIP_LIFT_PX = 36;
/** The least gap between the chip and the screen's side, in screen pixels. */
const CHIP_MARGIN_PX = 8;

type EdgeView = DeepReadonly<Edge>;
type NodeView = DeepReadonly<FactoryNode>;

/** An unselected edge's opacity, dimmer while its mesh is short (FR65). */
function edgeAlpha(short: boolean): number {
  return short ? PALETTE.edgeShortAlpha : PALETTE.edgeAlpha;
}

/** Strokes `line` onto `g` as an edge: round joins and caps. */
export function strokeLine(
  g: Graphics,
  line: readonly Point[],
  color: number,
  alpha: number,
  width = EDGE_WIDTH,
) {
  g.moveTo(line[0].x, line[0].y);
  for (let i = 1; i < line.length; i++) g.lineTo(line[i].x, line[i].y);
  return g.stroke({
    color,
    alpha,
    width,
    join: "round",
    cap: "round",
  });
}

/** Width of an edge's dashes in the overview, in world units. */
const DASH_WIDTH = CELL_PX * 0.6;
/** Length of one dash and of the gap after it, in world units. */
const DASH = CELL_PX * 2;
const DASH_GAP = CELL_PX;

/**
 * Strokes `line` onto `g` in dashes, one colour after another: the item mix
 * of an edge seen from far away (FR149).
 */
export function strokeDashes(
  g: Graphics,
  line: Polyline,
  colors: readonly number[],
) {
  for (let d = 0, k = 0; d < line.length; d += DASH + DASH_GAP, k++) {
    const dash = slice(line, d, Math.min(d + DASH, line.length));
    strokeLine(g, dash, colors[k % colors.length], 1, DASH_WIDTH);
  }
  return g;
}

interface EdgeDrawing {
  edge: EdgeView;
  from: NodeView;
  to: NodeView;
  selected: boolean;
  line: Polyline;
  /** The solid stroke, drawn white so its tint colours it. */
  g: Graphics;
  /** The overview's dashes, drawn for the item mix `dashed` names. */
  dashes: Graphics | null;
  dashed: string;
  /** The edge's main item, kept after the edge empties. */
  main: ItemId | null;
}

/**
 * Keeps one translucent stroke per edge in `layer` (GDD §Arte), diffing the
 * state's edges against the drawn ones each frame. An edge is redrawn when
 * it, either of its nodes or the selection changes. Its stroke takes the
 * colour of the item it carries most (FR149), and its mesh's shortage dims
 * it. In the overview it turns into dashes of its item mix.
 */
export class EdgeViews {
  private readonly views = new Map<EdgeId, EdgeDrawing>();

  constructor(private readonly layer: Container) {}

  sync(
    edges: ReadonlyMap<EdgeId, EdgeView>,
    nodes: ReadonlyMap<NodeId, NodeView>,
    selected: EdgeId | null,
    /** True when the edge's mesh is short of power. */
    isShort: (edge: EdgeView) => boolean,
    faded: NodeId | null = null,
    lod: Lod = "graph",
  ) {
    // A redrawn edge keeps the main item it showed.
    const mains = new Map<EdgeId, ItemId | null>();
    for (const [id, view] of this.views) {
      if (
        edges.get(id) !== view.edge ||
        nodes.get(view.edge.from) !== view.from ||
        nodes.get(view.edge.to) !== view.to ||
        (id === selected) !== view.selected
      ) {
        view.g.destroy();
        view.dashes?.destroy();
        mains.set(id, view.main);
        this.views.delete(id);
      }
    }
    for (const [id, edge] of edges) {
      if (this.views.has(id)) continue;
      const points = edgeLineOf(edge, nodes);
      if (!points) continue;
      const g = strokeLine(
        new Graphics({ label: `edge:${id}` }),
        points,
        0xffffff,
        1,
      );
      this.layer.addChild(g);
      this.views.set(id, {
        edge,
        from: nodes.get(edge.from)!,
        to: nodes.get(edge.to)!,
        selected: id === selected,
        line: measure(points),
        g,
        dashes: null,
        dashed: "",
        main: mains.get(id) ?? null,
      });
    }
    const overview = lod === "overview";
    for (const view of this.views.values()) {
      const { edge, g } = view;
      const mix = itemMix(edge.items);
      if (mix.length > 0) view.main = mix[0];
      // The selected edge keeps its highlighted stroke at any zoom.
      const dashed = overview && mix.length > 0 && !view.selected;
      if (dashed) this.drawDashes(view, mix);
      g.visible = !dashed;
      if (view.dashes) view.dashes.visible = dashed;

      g.tint = view.selected
        ? PALETTE.output
        : view.main
          ? ITEM_COLOR[view.main]
          : PALETTE.edge;
      // The edges of a node being moved fade with it.
      const alpha =
        (view.selected ? 0.9 : edgeAlpha(isShort(edge))) *
        (edge.from === faded || edge.to === faded ? MOVING_ALPHA : 1);
      g.alpha = alpha;
      if (view.dashes) view.dashes.alpha = alpha;
    }
  }

  /** The line edge `id` is drawn along, while it is drawn. */
  lineOf(id: EdgeId): Polyline | undefined {
    return this.views.get(id)?.line;
  }

  /** Drops every stroke, so the next `sync` draws them all again. */
  clear() {
    for (const { g, dashes } of this.views.values()) {
      g.destroy();
      dashes?.destroy();
    }
    this.views.clear();
  }

  /**
   * Redraws `view`'s dashes when its item types are not the ones drawn. They
   * keep the order of `ITEMS`, so a shift in counts does not redraw them.
   */
  private drawDashes(view: EdgeDrawing, mix: readonly ItemId[]) {
    const types = ITEMS.filter((item) => mix.includes(item));
    const key = types.join();
    if (key === view.dashed) return;
    view.dashes ??= this.layer.addChild(
      new Graphics({ label: `edge-dashes:${view.edge.id}` }),
    );
    strokeDashes(
      view.dashes.clear(),
      view.line,
      types.map((item) => ITEM_COLOR[item]),
    );
    view.dashed = key;
  }
}

/**
 * The edge being dragged, or a moving node's edges: their routes, green where
 * releasing builds them and red where it does not, the other edges they
 * would move out of the way in amber on their new routes, and a chip with the
 * reason and, for a dragged edge, its length, cost and throughput. The chip
 * keeps its screen size at any zoom.
 */
export class EdgePreviewView {
  private readonly line = new Graphics({ label: "edge-preview" });
  private readonly chip = new Container({ label: "edge-chip" });
  private readonly chipBg = new Graphics();
  private readonly chipText = new Text({
    text: "",
    style: {
      fontFamily: "system-ui, sans-serif",
      fontWeight: "600",
      fontSize: 13,
      fill: PALETTE.headerText,
    },
  });
  private drawn: EdgePreview | null = null;

  constructor(layer: Container) {
    layer.addChild(this.line, this.chip);
    this.chip.addChild(this.chipBg, this.chipText);
    this.chipText.anchor.set(0.5);
    this.line.visible = false;
    this.chip.visible = false;
  }

  /** Draws `preview`, at `scale` screen pixels per world unit. */
  update(preview: EdgePreview | null, camera: Camera, screenWidth: number) {
    if (preview !== this.drawn) {
      this.drawn = preview;
      this.redraw(preview);
    }
    if (!preview) return;
    const { scale } = camera;
    this.chip.scale.set(1 / scale);
    // Kept wholly on screen, so a drag at the screen's edge still reads it.
    const half = this.chipBg.width / 2 + CHIP_MARGIN_PX;
    const screenX = preview.tip.x * scale + camera.x;
    const x = Math.min(Math.max(screenX, half), screenWidth - half);
    this.chip.position.set(
      (x - camera.x) / scale,
      preview.tip.y - CHIP_LIFT_PX / scale,
    );
  }

  private redraw(preview: EdgePreview | null) {
    this.line.visible = preview !== null;
    this.chip.visible = preview?.reason != null || preview?.stats != null;
    if (!preview) return;
    const color =
      preview.reason === null ? GHOST_COLOR.valid : GHOST_COLOR.invalid;
    this.line.clear();
    for (const line of preview.moved ?? []) {
      strokeLine(this.line, line, REROUTE_COLOR, 0.8);
    }
    for (const line of preview.lines) strokeLine(this.line, line, color, 0.8);
    if (!this.chip.visible) return;
    const { reason, length, stats } = preview;
    const parts: string[] = [];
    if (reason) parts.push(edgeReasonText(reason, length, preview.max));
    if (stats && length !== null) {
      parts.push(edgeStatsText(length, stats.cost, stats.throughput));
    }
    this.chipText.text = parts.join(strings.menu.separator);
    const w = this.chipText.width + 20;
    const h = this.chipText.height + 8;
    this.chipBg
      .clear()
      .roundRect(-w / 2, -h / 2, w, h, h / 2)
      .fill({
        color: reason ? GHOST_COLOR.invalid : GHOST_COLOR.valid,
        alpha: 0.92,
      });
  }
}
