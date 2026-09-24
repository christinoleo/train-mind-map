import type { RawResource } from "../data/items";
import type { Rect } from "../sim/geometry/rect";

/** World units per map cell. The camera scales the world to the screen. */
export const CELL_PX = 16;

/** `r`, given in cells, in world units. */
export function toWorld(r: Rect): Rect {
  return {
    x: r.x * CELL_PX,
    y: r.y * CELL_PX,
    w: r.w * CELL_PX,
    h: r.h * CELL_PX,
  };
}

/** Blueprint palette (GDD §Direção de Arte): dark technical-paper blue. */
export const BLUEPRINT = {
  /** Page background, also the colour of the unrevealed map. */
  background: 0x0b1e3a,
  land: 0x12305a,
  water: 0x071429,
  grid: 0x8fb4e3,
  gridAlpha: 0.12,
  /** Every `majorEvery` cells the grid line is stronger. */
  majorEvery: 4,
  majorGridAlpha: 0.24,
  /** Frame around the revealed area. */
  border: 0xcfe0f5,
  ink: 0xf2f6fc,
  coreHeader: 0xf0a030,
  coreBody: 0x173a69,
} as const;

export type ResourceShape =
  "square" | "circle" | "triangle" | "diamond" | "drop";

interface ResourceStyle {
  color: number;
  shape: ResourceShape;
}

// Okabe-Ito hues plus a distinct shape per resource, so colour is never the
// only cue (FR150). The icons are placeholders until the item atlas lands.
export const RESOURCE_STYLE: Record<RawResource, ResourceStyle> = {
  "iron-ore": { color: 0x56b4e9, shape: "square" },
  "copper-ore": { color: 0xe69f00, shape: "circle" },
  coal: { color: 0xc9d1dc, shape: "triangle" },
  stone: { color: 0xf0e442, shape: "diamond" },
  "crude-oil": { color: 0xcc79a7, shape: "drop" },
};
