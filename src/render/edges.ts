import { Container, Graphics, Text } from "pixi.js";
import type { Point } from "../sim/geometry/planar";
import type { Edge, FactoryNode } from "../sim/state/gameState";
import type { EdgeId, NodeId } from "../sim/state/ids";
import type { Camera } from "../input/camera";
import type { EdgePreview } from "../input/tools/connect";
import { edgeReasonText } from "../ui/format";
import { edgeLineOf } from "./connectors";
import type { DeepReadonly } from "./readonly";
import { CELL_PX, GHOST_COLOR, PALETTE } from "./theme";

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

/**
 * Keeps one translucent stroke per edge in `layer` (GDD §Arte), diffing the
 * state's edges against the drawn ones each frame. An edge is redrawn when
 * it, either of its nodes or the selection changes; its mesh's shortage only
 * dims it. The item tint comes with the items (Epic 3).
 */
export class EdgeViews {
  private readonly views = new Map<
    EdgeId,
    {
      edge: EdgeView;
      from: NodeView;
      to: NodeView;
      selected: boolean;
      g: Graphics;
    }
  >();

  constructor(private readonly layer: Container) {}

  sync(
    edges: ReadonlyMap<EdgeId, EdgeView>,
    nodes: ReadonlyMap<NodeId, NodeView>,
    selected: EdgeId | null,
    /** True when the edge's mesh is short of power. */
    isShort: (edge: EdgeView) => boolean,
  ) {
    for (const [id, view] of this.views) {
      const edge = edges.get(id);
      if (
        edge !== view.edge ||
        nodes.get(view.edge.from) !== view.from ||
        nodes.get(view.edge.to) !== view.to ||
        (id === selected) !== view.selected
      ) {
        view.g.destroy();
        this.views.delete(id);
      } else if (!view.selected) {
        view.g.alpha = edgeAlpha(isShort(edge));
      }
    }
    for (const [id, edge] of edges) {
      if (this.views.has(id)) continue;
      const line = edgeLineOf(edge, nodes);
      if (!line) continue;
      const from = nodes.get(edge.from)!;
      const to = nodes.get(edge.to)!;
      const isSelected = id === selected;
      const g = strokeLine(
        new Graphics({ label: `edge:${id}` }),
        line,
        isSelected ? PALETTE.output : PALETTE.edge,
        1,
      );
      g.alpha = isSelected ? 0.9 : edgeAlpha(isShort(edge));
      this.layer.addChild(g);
      this.views.set(id, { edge, from, to, selected: isSelected, g });
    }
  }

  /** Drops every stroke, so the next `sync` draws them all again. */
  clear() {
    for (const { g } of this.views.values()) g.destroy();
    this.views.clear();
  }
}

/**
 * The edge being dragged: its route, green where releasing builds it and red
 * where it does not, and a chip with the reason. The chip keeps its screen
 * size at any zoom.
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
    this.chip.visible = preview?.reason != null;
    if (!preview) return;
    const color =
      preview.reason === null ? GHOST_COLOR.valid : GHOST_COLOR.invalid;
    strokeLine(this.line.clear(), preview.line, color, 0.8);
    if (!preview.reason) return;
    this.chipText.text = edgeReasonText(
      preview.reason,
      preview.length,
      preview.max,
    );
    const w = this.chipText.width + 20;
    const h = this.chipText.height + 8;
    this.chipBg
      .clear()
      .roundRect(-w / 2, -h / 2, w, h, h / 2)
      .fill({ color: GHOST_COLOR.invalid, alpha: 0.92 });
  }
}
