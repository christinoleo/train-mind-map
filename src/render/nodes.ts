import { Container, Graphics, Text } from "pixi.js";
import { MAX_ZOOM_SCALE } from "../config/constants";
import type { RawResource } from "../data/items";
import { NODES, type NodeKind } from "../data/nodes";
import type { FactoryNode } from "../sim/state/gameState";
import type { NodeId } from "../sim/state/ids";
import { strings } from "../ui/strings";
import { connectorPoints } from "./connectors";
import { drawGlyph } from "./mapView";
import type { DeepReadonly } from "./readonly";
import {
  CATEGORY_COLOR,
  CELL_PX,
  GHOST_COLOR,
  PALETTE,
  ITEM_STYLE,
  MOVING_ALPHA,
  STATE_COLOR,
  type FlaggedStatus,
} from "./theme";

/** Height of a card's category header, in world units. */
const HEADER = CELL_PX * 0.7;
/** Height of a card's state pill, in world units. */
const PILL_HEIGHT = CELL_PX * 0.55;
/** Radius of a connector's circle, in world units. */
const CONNECTOR_R = CELL_PX * 0.16;
const CARD_RADIUS = PALETTE.cardRadius * CELL_PX;

/** Side of a `kind` card, in world units. */
function cardSide(kind: NodeKind): number {
  return NODES[kind].size * CELL_PX;
}

/**
 * A node card drawn at its container's origin (GDD §Arte, FR149): a rounded
 * body with a soft shadow, a header in the category's colour with the name,
 * a recipe icon slot, hollow input circles on the left and amber output dots
 * on the right. An Extractor shows its resource's glyph in the slot.
 */
export function drawNodeCard(
  kind: NodeKind,
  resource?: RawResource,
): Container {
  const side = cardSide(kind);
  const card = new Container({ label: kind });
  const g = card.addChild(new Graphics());
  drawShadow(g, side);
  g.roundRect(0, 0, side, side, CARD_RADIUS).fill(PALETTE.card);
  // The header's top corners follow the card; its bottom edge is square.
  g.roundRect(0, 0, side, HEADER, CARD_RADIUS)
    .rect(0, HEADER / 2, side, HEADER / 2)
    .fill(CATEGORY_COLOR[NODES[kind].category]);

  const cx = side / 2;
  const cy = HEADER + (side - HEADER) / 2;
  const r = (side - HEADER) * 0.28;
  drawIconSlot(g, kind, cx, cy, r, resource);

  const { inputs, outputs } = connectorPoints(kind);
  for (const p of inputs) {
    g.circle(p.x, p.y, CONNECTOR_R)
      .fill(PALETTE.ground)
      .stroke({ color: PALETTE.inputRing, width: 1.4 });
  }
  for (const p of outputs) g.circle(p.x, p.y, CONNECTOR_R).fill(PALETTE.output);

  card.addChild(headerLabel(strings.nodes[kind], side));
  return card;
}

/**
 * The recipe icon slot. Recipes arrive with production (Epic 3); until then
 * the Core shows a hexagon, an Extractor its resource and the rest an empty
 * slot.
 */
function drawIconSlot(
  g: Graphics,
  kind: NodeKind,
  cx: number,
  cy: number,
  r: number,
  resource?: RawResource,
) {
  if (kind === "core") {
    const hex: number[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i + Math.PI / 6;
      hex.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
    }
    g.poly(hex).stroke({ color: PALETTE.dimText, width: 2 });
    return;
  }
  g.roundRect(cx - r, cy - r, 2 * r, 2 * r, r * 0.3).stroke({
    color: PALETTE.dimText,
    alpha: 0.5,
    width: 1,
  });
  if (resource) {
    const { color, shape } = ITEM_STYLE[resource];
    drawGlyph(g, shape, cx, cy, r * 0.55).fill(color);
  }
}

/** Adds a card's soft shadow: stacked, fading rounded rects below it. */
function drawShadow(g: Graphics, side: number): void {
  for (let i = 3; i >= 1; i--) {
    const spread = i * 1.5;
    g.roundRect(
      -spread,
      -spread + 3,
      side + 2 * spread,
      side + 2 * spread,
      CARD_RADIUS + spread,
    ).fill({ color: PALETTE.shadow, alpha: 0.12 });
  }
}

/**
 * Bold card text of `fontSize` world units, rasterised at the largest zoom so
 * it stays sharp when the camera zooms in, and shrunk to fit `maxWidth`.
 */
function cardText(label: string, fontSize: number, maxWidth: number): Text {
  const scale = MAX_ZOOM_SCALE;
  const text = new Text({
    text: label,
    style: {
      fontFamily: "system-ui, sans-serif",
      fontWeight: "700",
      fontSize: fontSize * scale,
      fill: PALETTE.headerText,
    },
  });
  const fit = Math.min(1, maxWidth / (text.width / scale));
  text.scale.set(fit / scale);
  return text;
}

/**
 * The name in the header, rasterised at the largest zoom so it stays sharp
 * when the camera zooms in, and shrunk to fit the card.
 */
function headerLabel(label: string, side: number): Text {
  const pad = CELL_PX * 0.2;
  const text = cardText(label, HEADER * 0.6, side - 2 * pad);
  text.anchor.set(0, 0.5);
  text.position.set(pad, HEADER / 2);
  return text;
}

/**
 * Strokes `g` with the placement ghost's outline for `kind`: green where the
 * node fits, red where it does not. The card under it is a plain
 * `drawNodeCard`, so a change of validity redraws only this.
 */
export function drawGhostOutline(g: Graphics, kind: NodeKind, valid: boolean) {
  const side = cardSide(kind);
  return g
    .clear()
    .roundRect(0, 0, side, side, CARD_RADIUS)
    .stroke({
      color: valid ? GHOST_COLOR.valid : GHOST_COLOR.invalid,
      width: 2,
    });
}

type NodeView = DeepReadonly<FactoryNode>;

/** What `node` is doing, when it makes items and is not working. */
export function flaggedStatus(node: NodeView): FlaggedStatus | null {
  if (!("production" in node)) return null;
  const { status } = node.production;
  return status === "working" ? null : status;
}

/**
 * A card's state (FR149): an outline round the card and a pill on its
 * bottom edge naming the state, both in the state's colour.
 */
function drawStatusBadge(kind: NodeKind, status: FlaggedStatus) {
  const side = cardSide(kind);
  const color = STATE_COLOR[status];
  const badge = new Container({ label: `status:${status}` });
  const g = badge.addChild(new Graphics());
  g.roundRect(0, 0, side, side, CARD_RADIUS).stroke({ color, width: 2 });

  const h = PILL_HEIGHT;
  const text = cardText(strings.nodeStatus[status], h * 0.62, side - h);
  text.anchor.set(0.5);
  text.position.set(side / 2, side);
  const w = text.width + h;
  g.roundRect(side / 2 - w / 2, side - h / 2, w, h, h / 2).fill(color);
  badge.addChild(text);
  return badge;
}

/**
 * Keeps one card per node in `layer`, diffing the state's nodes against the
 * drawn ones each frame. A node object that changes identity is redrawn; a
 * change of status only shows another badge, each built once and kept.
 */
export class NodeViews {
  private readonly views = new Map<
    NodeId,
    {
      node: NodeView;
      card: Container;
      status: FlaggedStatus | null;
      /** Each status's badge, built the first time the node shows it. */
      badges: Partial<Record<FlaggedStatus, Container>>;
    }
  >();

  constructor(private readonly layer: Container) {}

  /** `faded` names the node being moved, drawn faint, or none with `null`. */
  sync(nodes: ReadonlyMap<NodeId, NodeView>, faded: NodeId | null = null) {
    for (const [id, view] of this.views) {
      if (nodes.get(id) !== view.node) {
        view.card.destroy({ children: true });
        this.views.delete(id);
      }
    }
    for (const [id, node] of nodes) {
      if (this.views.has(id)) continue;
      const card = drawNodeCard(
        node.kind,
        node.kind === "extractor" ? node.resource : undefined,
      );
      card.position.set(node.x * CELL_PX, node.y * CELL_PX);
      this.layer.addChild(card);
      this.views.set(id, { node, card, status: null, badges: {} });
    }
    for (const [id, view] of this.views) {
      view.card.alpha = id === faded ? MOVING_ALPHA : 1;
      const status = flaggedStatus(view.node);
      if (status === view.status) continue;
      const { badges } = view;
      if (view.status) badges[view.status]!.visible = false;
      if (status) {
        (badges[status] ??= view.card.addChild(
          drawStatusBadge(view.node.kind, status),
        )).visible = true;
      }
      view.status = status;
    }
  }

  /** Drops every card, so the next `sync` draws them all again. */
  clear() {
    for (const { card } of this.views.values()) {
      card.destroy({ children: true });
    }
    this.views.clear();
  }
}
