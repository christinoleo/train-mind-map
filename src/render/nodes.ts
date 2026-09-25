import { Container, Graphics, type Text } from "pixi.js";
import type { Lod } from "../input/camera";
import type { ItemId, RawResource } from "../data/items";
import { NODES, type NodeKind } from "../data/nodes";
import { RECIPES } from "../data/recipes";
import type { FactoryNode } from "../sim/state/gameState";
import type { NodeId } from "../sim/state/ids";
import type { Coverage } from "../sim/state/map";
import { drawsPower } from "../sim/state/power";
import { inputTypes, type Typed } from "../sim/state/production";
import { coverageText } from "../ui/format";
import { strings } from "../ui/strings";
import { connectorPoints } from "./connectors";
import { drawGlyph } from "./mapView";
import type { DeepReadonly } from "./readonly";
import { worldText } from "./text";
import {
  CATEGORY_COLOR,
  CELL_PX,
  GHOST_COLOR,
  LIFT,
  PALETTE,
  SELECTED_COLOR,
  ITEM_STYLE,
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
/** Radius of a typed input's circle, large enough to show its glyph. */
const TYPED_R = CELL_PX * 0.22;
/** Height of a typed input's item name, in world units. */
const INPUT_NAME = CELL_PX * 0.2;
const CARD_RADIUS = PALETTE.cardRadius * CELL_PX;

/** Side of a `kind` card, in world units. */
export function cardSide(kind: NodeKind): number {
  return NODES[kind].size * CELL_PX;
}

/**
 * A node card drawn at its container's origin (GDD §Arte, FR149): a rounded
 * body with a soft shadow, a header in the category's colour with the name,
 * a recipe icon slot, hollow input circles on the left and amber output dots
 * on the right. A typed input (FR25) holds its item's glyph in the item's
 * colour, with the item's name beside it, labelled `item-name` like the
 * slot's. The slot shows `item`'s glyph, with its name in a band at the
 * bottom of the body (FR150), labelled `item-name` so the level of detail can
 * hide it; `name` replaces the item's name there. An Extractor's item is its
 * main resource, and its name gives each resource's share (FR30).
 */
export function drawNodeCard(
  node: Typed,
  item?: ItemId,
  name: string | undefined = item && strings.items[item],
): Container {
  const { kind } = node;
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

  const { inputs, outputs } = connectorPoints(node);
  const types = inputTypes(node);
  inputs.forEach((p, port) => {
    const type = types[port];
    if (type === null) {
      g.circle(p.x, p.y, CONNECTOR_R)
        .fill(PALETTE.ground)
        .stroke({ color: PALETTE.inputRing, width: 1.4 });
      return;
    }
    const { color, shape } = ITEM_STYLE[type];
    g.circle(p.x, p.y, TYPED_R)
      .fill(PALETTE.ground)
      .stroke({ color, width: 1.4 });
    drawGlyph(g, shape, p.x, p.y, TYPED_R * 0.62).fill(color);
    card.addChild(inputLabel(type, p, side));
  });
  for (const p of outputs) g.circle(p.x, p.y, CONNECTOR_R).fill(PALETTE.output);

  card.addChild(headerLabel(strings.nodes[kind], side));
  if (name) card.addChild(itemLabel(name, side));
  return card;
}

/**
 * The item a node's slot shows: an Extractor's main resource, or what a
 * crafter's recipe makes.
 */
export function iconItem(node: NodeView): ItemId | undefined {
  if (node.kind === "extractor") return mainResource(node.coverage);
  if ("recipe" in node && node.recipe) return RECIPES[node.recipe].output;
  return undefined;
}

/** The resource over most of an Extractor's cells, the first on a tie. */
export function mainResource(coverage: DeepReadonly<Coverage[]>): RawResource {
  return coverage.reduce((a, b) => (b.cells > a.cells ? b : a)).resource;
}

/** The slot item's name, centred in the band at the bottom of the card. */
function itemLabel(name: string, side: number) {
  const text = worldText(name, NAME_BAND * 0.6, {
    fill: PALETTE.text,
    maxWidth: side - 2 * CONNECTOR_R - CELL_PX * 0.2,
  });
  text.label = ITEM_NAME;
  text.anchor.set(0.5);
  text.position.set(side / 2, side - NAME_BAND / 2);
  return text;
}

/**
 * A typed input's item name, just inside the card, right of its connector,
 * shrunk to end before the card's middle so it clears the outputs.
 */
function inputLabel(item: ItemId, at: { x: number; y: number }, side: number) {
  const text = worldText(strings.items[item], INPUT_NAME, {
    fill: PALETTE.dimText,
    maxWidth: side / 2 - TYPED_R,
  });
  text.label = ITEM_NAME;
  text.anchor.set(0, 0.5);
  text.position.set(at.x + TYPED_R + CELL_PX * 0.05, at.y);
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

/**
 * Adds three rounded rects round a card of `side`, `step` apart and `drop`
 * lower, each painted by `paint` so they stack into a soft halo.
 */
function drawHalo(
  g: Graphics,
  side: number,
  step: number,
  drop: number,
  paint: (g: Graphics) => void,
): void {
  for (let i = 3; i >= 1; i--) {
    const spread = i * step;
    paint(
      g.roundRect(
        -spread,
        -spread + drop,
        side + 2 * spread,
        side + 2 * spread,
        CARD_RADIUS + spread,
      ),
    );
  }
}

const paintShadow = (g: Graphics) =>
  g.fill({ color: PALETTE.shadow, alpha: 0.12 });

/** Adds a card's soft shadow: stacked, fading rounded rects below it. */
function drawShadow(g: Graphics, side: number): void {
  drawHalo(g, side, 1.5, 3, paintShadow);
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

/**
 * Draws into `g` the outline of the node whose action bubble is open (FR19):
 * an amber stroke round its card with a soft glow outside it.
 */
export function drawSelection(g: Graphics, kind: NodeKind) {
  const side = cardSide(kind);
  drawHalo(g.clear(), side, 2.5, 0, (g) =>
    g.stroke({ color: SELECTED_COLOR, alpha: 0.1, width: 3 }),
  );
  return g
    .roundRect(0, 0, side, side, CARD_RADIUS)
    .stroke({ color: SELECTED_COLOR, width: 2.5 });
}

/**
 * Draws into `g` the dashed outline a lifted node leaves on its cell
 * (FR134): where it goes back to if the drop is refused.
 */
export function drawLiftOrigin(g: Graphics, kind: NodeKind) {
  const side = cardSide(kind);
  const dash = CELL_PX * 0.3;
  g.clear();
  for (let at = 0; at < side; at += 2 * dash) {
    const end = Math.min(at + dash, side);
    g.moveTo(at, 0).lineTo(end, 0);
    g.moveTo(at, side).lineTo(end, side);
    g.moveTo(0, at).lineTo(0, end);
    g.moveTo(side, at).lineTo(side, end);
  }
  return g.stroke({ color: PALETTE.dimText, width: 2 });
}

/**
 * Draws into `g` the deeper shadow under a lifted card (FR134), so it reads
 * as held above the map.
 */
export function drawLiftShadow(g: Graphics, kind: NodeKind) {
  drawHalo(g.clear(), cardSide(kind), 2, LIFT.shadowDrop, paintShadow);
  return g;
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
      /** The item names on the card: its item's and its typed inputs'. */
      names: Container[];
      status: FlaggedStatus | null;
      /** Each status's badge, built the first time the node shows it. */
      badges: Partial<Record<FlaggedStatus, Container>>;
    }
  >();

  constructor(private readonly layer: Container) {}

  /**
   * `satisfaction` is the power grid's. `lifted` names the node being moved,
   * whose card the ghost draws instead, or none with `null`. Returns true when a card was added or
   * dropped.
   */
  sync(
    nodes: ReadonlyMap<NodeId, NodeView>,
    satisfaction: number,
    lifted: NodeId | null = null,
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
      const name =
        node.kind === "extractor" ? coverageText(node.coverage) : undefined;
      const card = drawNodeCard(node, item, name);
      card.position.set(node.x * CELL_PX, node.y * CELL_PX);
      this.layer.addChild(card);
      this.views.set(id, {
        node,
        card,
        item,
        names: card.getChildrenByLabel(ITEM_NAME),
        status: null,
        badges: {},
      });
    }
    const named = lod === "icons";
    for (const [id, view] of this.views) {
      view.card.visible = id !== lifted;
      for (const name of view.names) name.visible = named;
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
