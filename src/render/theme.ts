import { CELL_PX } from "../config/constants";
import { ITEMS, type ItemId } from "../data/items";
import type { NodeCategory } from "../data/nodes";
import type { Rect } from "../sim/geometry/rect";
import type { NodeStatus } from "../sim/state/gameState";

export { CELL_PX };

/** `r`, given in cells, in world units. */
export function toWorld(r: Rect): Rect {
  return {
    x: r.x * CELL_PX,
    y: r.y * CELL_PX,
    w: r.w * CELL_PX,
    h: r.h * CELL_PX,
  };
}

/** Node-editor palette (GDD §Arte, decision in #7): slate ground, card nodes. */
export const PALETTE = {
  /** Unrevealed map around the revealed area, darker than the ground. */
  void: 0x13161c,
  /** Revealed land. */
  ground: 0x1b1f27,
  grid: 0xffffff,
  gridAlpha: 0.04,
  /** Every `majorEvery` cells the grid line is stronger. */
  majorEvery: 5,
  majorGridAlpha: 0.08,
  water: 0x1e3a5f,
  /** Corner radius of lakes, in cells. */
  waterRadius: 0.4,
  /** Alpha of the item-coloured tint under a deposit. */
  depositTintAlpha: 0.13,
  card: 0x2b303c,
  /** Card corner radius, in cells. */
  cardRadius: 0.25,
  /** Soft drop shadow under cards. */
  shadow: 0x000000,
  /** Text on a category header. */
  headerText: 0x15181f,
  text: 0xe4e7ee,
  dimText: 0x8a93a6,
  /** A hollow circle marks an input connector. */
  inputRing: 0xcfd5e2,
  /** An amber dot marks an output connector. */
  output: 0xffb547,
  /** An edge's stroke before any item has run along it. */
  edge: 0xcfd5e2,
  edgeAlpha: 0.4,
  /** An edge glows dimmer while its mesh is short of power (FR65). */
  edgeShortAlpha: 0.15,
} as const;

/** A 0xRRGGBB colour as a CSS hex string, for DOM and canvas 2D use. */
export function cssColor(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

/**
 * Node header colour per category. The GDD names the first six; logistics,
 * research and rail get their own hues so no two categories share one.
 */
export const CATEGORY_COLOR: Record<NodeCategory, number> = {
  core: 0xf5c542,
  extraction: 0xd9a45b,
  smelting: 0xe0735a,
  assembly: 0x6b9cff,
  power: 0xb98cff,
  storage: 0x6fcf97,
  logistics: 0x5ec8c8,
  research: 0xf28fb8,
  rail: 0xff9f1c,
};

/** Outline of the placement ghost: green where it fits, red where it does not. */
export const GHOST_COLOR = { valid: 0x4ade80, invalid: 0xf87171 } as const;
export const GHOST_ALPHA = 0.6;
/** A node being moved, and its edges, fade to this while its ghost is dragged. */
export const MOVING_ALPHA = 0.3;
/** Opacity of the layer out of focus: the factory or the rails (FR78). */
export const UNFOCUSED_ALPHA = 0.3;

/** A status a card flags: every one but working. */
export type FlaggedStatus = Exclude<NodeStatus, "working">;

/**
 * Colour of a node's state pill and outline (FR149): red for blocked or
 * starved, yellow for no power. A working node shows neither.
 */
export const STATE_COLOR: Record<FlaggedStatus, number> = {
  blocked: 0xf87171,
  starved: 0xf87171,
  no_power: 0xfacc15,
};

export type GlyphShape =
  | "circle"
  | "square"
  | "diamond"
  | "gear"
  | "flask"
  | "triangle"
  | "hexagon"
  | "bar";

interface ItemStyle {
  color: number;
  shape: GlyphShape;
}

// Okabe-Ito hues plus a shape per item (FR150): the raw resources each have
// their own shape, and no two items share both colour and shape. Some
// products still share a shape with another item; a glyph for each of the
// ~31 items comes with the item atlas (Epic 9).
export const ITEM_STYLE: Record<ItemId, ItemStyle> = {
  "iron-ore": { color: 0x56b4e9, shape: "square" },
  "copper-ore": { color: 0xe69f00, shape: "circle" },
  coal: { color: 0xc9d1dc, shape: "diamond" },
  stone: { color: 0xf0e442, shape: "gear" },
  "crude-oil": { color: 0xcc79a7, shape: "flask" },
  "iron-plate": { color: 0xb4c8dc, shape: "hexagon" },
  "copper-plate": { color: 0xd55e00, shape: "hexagon" },
  brick: { color: 0xa0522d, shape: "square" },
  gear: { color: 0x8a93a6, shape: "gear" },
  "copper-cable": { color: 0xf0a868, shape: "bar" },
  circuit: { color: 0x009e73, shape: "triangle" },
  rail: { color: 0x7a6a58, shape: "bar" },
  "red-science": { color: 0xe0455a, shape: "flask" },
};

/** Each item's colour: its swatch in the stock HUD, its dot and its edge's tint. */
export const ITEM_COLOR = Object.fromEntries(
  ITEMS.map((item) => [item, ITEM_STYLE[item].color]),
) as Record<ItemId, number>;

/** How long construction items fly from storage to the site (FR72). */
export const BUILD_FLIGHT_MS = 600;
/** Delay between successive items leaving for the same site. */
export const BUILD_FLIGHT_STAGGER_MS = 60;

/** How long a tapped item flies from its deposit to the Core (FR74). */
export const TAP_FLIGHT_MS = 400;
/** How long the pop on a tapped cell lasts. */
export const TAP_POP_MS = 300;
