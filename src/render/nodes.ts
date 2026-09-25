import { Container, Graphics, type Text } from "pixi.js";
import type { Lod } from "../input/camera";
import type { ItemId } from "../data/items";
import { NODES, type NodeKind } from "../data/nodes";
import { RECIPES } from "../data/recipes";
import type { FactoryNode } from "../sim/state/gameState";
import type { NodeId } from "../sim/state/ids";
import { drawsPower } from "../sim/state/power";
import { strings } from "../ui/strings";
import { connectorPoints } from "./connectors";
import { drawGlyph } from "./mapView";
import type { DeepReadonly } from "./readonly";
import { worldText } from "./text";
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
/** Height of the band at the bottom of a card that names its item. */
const NAME_BAND = CELL_PX * 0.5;
/** Height of a card's state pill, in world units. */
const PILL_HEIGHT = CELL_PX * 0.55;
/** Gap between a card's bottom edge and its state pill, in world units. */
const PILL_GAP = CELL_PX * 0.12;
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
 * on the right. The slot shows `item`'s glyph, with its name in a band at the
 * bottom of the body (FR150), labelled `item-name` so the level of detail can
 * hide it. An Extractor's item is its deposit's resource.
 */
export function drawNodeCard(kind: NodeKind, item?: ItemId): Container {
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
  const body = side - HEADER - NAME_BAND;
  const cy = HEADER + body / 2;
  const r = body * 0.36;
  drawIconSlot(g, kind, cx, cy, r, item);

  const { inputs, outputs } = connectorPoints(kind);
  for (const p of inputs) {
    g.circle(p.x, p.y, CONNECTOR_R)
      .fill(PALETTE.ground)
      .stroke({ color: PALETTE.inputRing, width: 1.4 });
  }
  for (const p of outputs) g.circle(p.x, p.y, CONNECTOR_R).fill(PALETTE.output);

  card.addChild(headerLabel(strings.nodes[kind], side));
  if (item) card.addChild(itemLabel(item, side));
  return card;
}

/**
 * The item a node's slot shows: an Extractor's resource, or what a crafter's
 * recipe makes.
 */
export function iconItem(node: NodeView): ItemId | undefined {
  if (node.kind === "extractor") return node.resource;
  if ("recipe" in node && node.recipe) return RECIPES[node.recipe].output;
  return undefined;
}

/** The slot item's name, centred in the band at the bottom of the card. */
function itemLabel(item: ItemId, side: number) {
  const text = worldText(strings.items[item], NAME_BAND * 0.6, {
    fill: PALETTE.text,
    maxWidth: side - 2 * CONNECTOR_R - CELL_PX * 0.2,
  });
  text.label = ITEM_NAME;
  text.anchor.set(0.5);
  text.position.set(side / 2, side - NAME_BAND / 2);
  return text;
}

/** The label of a card's item name. */
const ITEM_NAME = "item-name";

/**
 * The recipe icon slot: a hexagon on the Core, else a frame round `item`'s
 * glyph, empty while there is no item.
 */
function drawIconSlot(
  g: Graphics,
  kind: NodeKind,
  cx: number,
  cy: number,
  r: number,
  item?: ItemId,
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
  if (item) {
    const { color, shape } = ITEM_STYLE[item];
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
 * The name in the header, rasterised at the largest zoom so it stays sharp
 * when the camera zooms in, and shrunk to fit the card.
 */
function headerLabel(label: string, side: number): Text {
  const pad = CELL_PX * 0.2;
  const text = worldText(label, HEADER * 0.6, { maxWidth: side - 2 * pad });
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

/**
 * What `node` is doing, when it makes items and is not working at full
 * speed: its status, or low power while it works on a grid whose
 * `satisfaction` is below 1 (FR64).
 */
export function flaggedStatus(
  node: NodeView,
  satisfaction: number,
): FlaggedStatus | null {
  if (!("production" in node)) return null;
  const { status } = node.production;
  if (status !== "working") return status;
  return satisfaction < 1 && drawsPower(node) ? "low_power" : null;
}

/**
 * A card's state (FR149): an outline round the card and a pill centred below
 * it naming the state, both in the state's colour. The pill sits wholly
 * outside the card, so it never covers the card's text.
 */
function drawStatusBadge(kind: NodeKind, status: FlaggedStatus) {
  const side = cardSide(kind);
  const color = STATE_COLOR[status];
  const badge = new Container({ label: `status:${status}` });
  const g = badge.addChild(new Graphics());
  g.roundRect(0, 0, side, side, CARD_RADIUS).stroke({ color, width: 2 });

  const h = PILL_HEIGHT;
  const text = worldText(strings.nodeStatus[status], h * 0.62, {
    maxWidth: side - h,
  });
  text.anchor.set(0.5);
  const top = side + PILL_GAP;
  text.position.set(side / 2, top + h / 2);
  const w = text.width + h;
  g.roundRect(side / 2 - w / 2, top, w, h, h / 2).fill(color);
  badge.addChild(text);
  return badge;
}

/**
 * Keeps one card per node in `layer`, diffing the state's nodes against the
 * drawn ones each frame. A node object that changes identity or slot item is
 * redrawn; a change of status only shows another badge, each built once and
 * kept. Item names show at the closest level of detail only.
 */
export class NodeViews {
  private readonly views = new Map<
    NodeId,
    {
      node: NodeView;
      card: Container;
      item: ItemId | undefined;
      /** The item's name under the card, if it has an item. */
      name: Container | null;
      status: FlaggedStatus | null;
      /** Each status's badge, built the first time the node shows it. */
      badges: Partial<Record<FlaggedStatus, Container>>;
    }
  >();

  constructor(private readonly layer: Container) {}

  /**
   * `satisfaction` is the power grid's. `faded` names the node being moved,
   * drawn faint, or none with `null`. Returns true when a card was added or
   * dropped.
   */
  sync(
    nodes: ReadonlyMap<NodeId, NodeView>,
    satisfaction: number,
    faded: NodeId | null = null,
    lod: Lod = "icons",
  ): boolean {
    let changed = false;
    for (const [id, view] of this.views) {
      const node = nodes.get(id);
      if (node !== view.node || iconItem(node) !== view.item) {
        view.card.destroy({ children: true });
        this.views.delete(id);
        changed = true;
      }
    }
    for (const [id, node] of nodes) {
      if (this.views.has(id)) continue;
      changed = true;
      const item = iconItem(node);
      const card = drawNodeCard(node.kind, item);
      card.position.set(node.x * CELL_PX, node.y * CELL_PX);
      this.layer.addChild(card);
      this.views.set(id, {
        node,
        card,
        item,
        name: card.getChildByLabel(ITEM_NAME),
        status: null,
        badges: {},
      });
    }
    const named = lod === "icons";
    for (const [id, view] of this.views) {
      view.card.alpha = id === faded ? MOVING_ALPHA : 1;
      if (view.name) view.name.visible = named;
      const status = flaggedStatus(view.node, satisfaction);
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
    return changed;
  }

  /** Drops every card, so the next `sync` draws them all again. */
  clear() {
    for (const { card } of this.views.values()) {
      card.destroy({ children: true });
    }
    this.views.clear();
  }
}
