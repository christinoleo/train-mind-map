import { CELL_PX } from "../config/constants";
import type { RawResource } from "../data/items";
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

/** Node header colour per category. */
export const CATEGORY_COLOR = {
  core: 0xf5c542,
  extraction: 0xd9a45b,
  smelting: 0xe0735a,
  assembly: 0x6b9cff,
  power: 0xb98cff,
  storage: 0x6fcf97,
} as const;

export type NodeCategory = keyof typeof CATEGORY_COLOR;

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
