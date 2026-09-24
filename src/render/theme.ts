import { CELL_PX } from "../config/constants";
import type { RawResource } from "../data/items";
import type { NodeCategory } from "../data/nodes";
import type { Rect } from "../sim/geometry/rect";

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
  rail: 0xc9a27a,
};

/** Outline of the placement ghost: green where it fits, red where it does not. */
export const GHOST_COLOR = { valid: 0x4ade80, invalid: 0xf87171 } as const;
export const GHOST_ALPHA = 0.6;

/** Node state colours: red for blocked or starved, yellow for no power. */
export const STATE_COLOR = {
  blocked: 0xf87171,
  starved: 0xf87171,
  noPower: 0xfacc15,
} as const;

export type GlyphShape = "circle" | "square" | "diamond" | "gear" | "flask";

interface ItemStyle {
  color: number;
  shape: GlyphShape;
}

// Okabe-Ito hues plus a distinct shape per resource, so colour is never the
// only cue (FR150). The glyphs are placeholders until the item atlas lands.
export const RESOURCE_STYLE: Record<RawResource, ItemStyle> = {
  "iron-ore": { color: 0x56b4e9, shape: "square" },
  "copper-ore": { color: 0xe69f00, shape: "circle" },
  coal: { color: 0xc9d1dc, shape: "diamond" },
  stone: { color: 0xf0e442, shape: "gear" },
  "crude-oil": { color: 0xcc79a7, shape: "flask" },
};
