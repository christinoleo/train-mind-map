import { Container, Graphics, Text } from "pixi.js";
import { MAP_SIZE, MAX_ZOOM_SCALE } from "../config/constants";
import type { Rect } from "../sim/geometry/rect";
import {
  cellIndex,
  revealedSize,
  Terrain,
  type GameMap,
} from "../sim/state/map";
import type { DeepReadonly } from "./readonly";
import { strings } from "../ui/strings";
import {
  CATEGORY_COLOR,
  CELL_PX,
  PALETTE,
  RESOURCE_STYLE,
  toWorld,
  type GlyphShape,
} from "./theme";

type MapView = DeepReadonly<GameMap>;

/** The square that `ring` reveals, in cells, clipped to the map. */
export function ringBounds(ring: number): Rect {
  const side = Math.min(revealedSize(ring), MAP_SIZE);
  const start = (MAP_SIZE - side) / 2;
  return { x: start, y: start, w: side, h: side };
}

/** The revealed square, in cells. Nothing outside it is drawn. */
export function revealedBounds(map: MapView): Rect {
  return ringBounds(map.revealedRing);
}

/** True when `rect` lies wholly inside `bounds`. */
export function isInside(rect: Rect, bounds: Rect): boolean {
  return (
    rect.x >= bounds.x &&
    rect.y >= bounds.y &&
    rect.x + rect.w <= bounds.x + bounds.w &&
    rect.y + rect.h <= bounds.y + bounds.h
  );
}

/** The water cells inside `bounds`, merged into one-row runs. */
export function waterRuns(map: MapView, bounds: Rect): Rect[] {
  const runs: Rect[] = [];
  for (let y = bounds.y; y < bounds.y + bounds.h; y++) {
    let start = -1;
    const end = bounds.x + bounds.w;
    for (let x = bounds.x; x < end; x++) {
      const water = map.terrain[cellIndex(x, y)] === Terrain.Water;
      if (water && start < 0) start = x;
      if (!water && start >= 0) {
        runs.push({ x: start, y, w: x - start, h: 1 });
        start = -1;
      }
    }
    if (start >= 0) runs.push({ x: start, y, w: end - start, h: 1 });
  }
  return runs;
}

/**
 * A corner of a map cell that the terrain rounds off, in cells. `x` and `y`
 * name the corner point; `dx` and `dy` point from it into the cell. A water
 * corner fills a land cell's concave corner with water; a ground corner cuts
 * a water cell's convex corner back to land.
 */
export interface RoundedCorner {
  x: number;
  y: number;
  dx: 1 | -1;
  dy: 1 | -1;
  fill: "water" | "ground";
}

/** The four directions from a cell corner into the cell. */
const DIAGONALS = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const;

/** The corners inside `bounds` where a lake's outline turns. */
export function roundedCorners(map: MapView, bounds: Rect): RoundedCorner[] {
  const corners: RoundedCorner[] = [];
  // Cells off the map count as the cell itself, so edges stay square there.
  const isWater = (x: number, y: number, self: boolean) =>
    x < 0 || y < 0 || x >= MAP_SIZE || y >= MAP_SIZE
      ? self
      : map.terrain[cellIndex(x, y)] === Terrain.Water;
  for (let y = bounds.y; y < bounds.y + bounds.h; y++) {
    for (let x = bounds.x; x < bounds.x + bounds.w; x++) {
      const self = isWater(x, y, false);
      for (const [dx, dy] of DIAGONALS) {
        const side = isWater(x - dx, y, self);
        const above = isWater(x, y - dy, self);
        let fill: RoundedCorner["fill"] | undefined;
        if (self && !side && !above) fill = "ground";
        else if (!self && side && above && isWater(x - dx, y - dy, self)) {
          fill = "water";
        }
        if (fill) {
          corners.push({
            x: x + (dx < 0 ? 1 : 0),
            y: y + (dy < 0 ? 1 : 0),
            dx,
            dy,
            fill,
          });
        }
      }
    }
  }
  return corners;
}

function cellRect(g: Graphics, r: Rect): Graphics {
  const { x, y, w, h } = toWorld(r);
  return g.rect(x, y, w, h);
}

/** Adds the path of the fillet that rounds `c` off with radius `r`. */
function cornerFillet(g: Graphics, c: RoundedCorner, r: number): Graphics {
  const x = c.x * CELL_PX;
  const y = c.y * CELL_PX;
  return g
    .moveTo(x, y)
    .lineTo(x + c.dx * r, y)
    .arcTo(x, y, x, y + c.dy * r, r)
    .closePath();
}

/** Ground, rounded lakes and the cell grid of the revealed area. */
export function drawTerrain(map: MapView, bounds: Rect): Graphics {
  const g = new Graphics({ label: "terrain" });
  cellRect(g, bounds).fill(PALETTE.ground);
  for (const run of waterRuns(map, bounds)) cellRect(g, run);
  g.fill(PALETTE.water);
  const corners = roundedCorners(map, bounds);
  const r = PALETTE.waterRadius * CELL_PX;
  for (const fill of ["ground", "water"] as const) {
    for (const c of corners) if (c.fill === fill) cornerFillet(g, c, r);
    g.fill(PALETTE[fill]);
  }

  const world = toWorld(bounds);
  const x0 = world.x;
  const y0 = world.y;
  const x1 = x0 + world.w;
  const y1 = y0 + world.h;
  for (const major of [false, true]) {
    g.beginPath();
    for (let i = 1; i < bounds.w; i++) {
      if (((bounds.x + i) % PALETTE.majorEvery === 0) !== major) continue;
      const x = x0 + i * CELL_PX;
      g.moveTo(x, y0).lineTo(x, y1);
    }
    for (let i = 1; i < bounds.h; i++) {
      if (((bounds.y + i) % PALETTE.majorEvery === 0) !== major) continue;
      const y = y0 + i * CELL_PX;
      g.moveTo(x0, y).lineTo(x1, y);
    }
    g.stroke({
      color: PALETTE.grid,
      alpha: major ? PALETTE.majorGridAlpha : PALETTE.gridAlpha,
      pixelLine: true,
    });
  }
  return g;
}

/**
 * Each revealed deposit: a rounded patch tinted in its resource's colour,
 * with the resource's glyph on every other cell.
 */
export function drawDeposits(map: MapView, bounds: Rect): Graphics {
  const g = new Graphics({ label: "deposits" });
  const glyphR = CELL_PX * 0.2;
  for (const deposit of map.deposits) {
    if (!isInside(deposit, bounds)) continue;
    const { color, shape } = RESOURCE_STYLE[deposit.resource];
    const { x, y, w, h } = toWorld(deposit);
    g.roundRect(x, y, w, h, CELL_PX * 0.3).fill({
      color,
      alpha: PALETTE.depositTintAlpha,
    });
    for (let i = 0; i < deposit.w; i++) {
      for (let j = 0; j < deposit.h; j++) {
        if ((i + j) % 2 !== 0) continue;
        const cx = x + (i + 0.5) * CELL_PX;
        const cy = y + (j + 0.5) * CELL_PX;
        drawGlyph(g, shape, cx, cy, glyphR);
      }
    }
    g.fill(color).stroke({ color: PALETTE.shadow, alpha: 0.45, width: 1 });
  }
  return g;
}

/** Adds the path of an item glyph of radius `r`. */
function drawGlyph(
  g: Graphics,
  shape: GlyphShape,
  cx: number,
  cy: number,
  r: number,
): Graphics {
  switch (shape) {
    case "circle":
      return g.circle(cx, cy, r);
    case "square":
      return g.rect(cx - r * 0.85, cy - r * 0.85, r * 1.7, r * 1.7);
    default:
      return g.poly(
        GLYPH_POLYS[shape].map((v, i) => (i % 2 ? cy : cx) + v * r),
      );
  }
}

/** Polygon glyphs as flat x, y offsets for a glyph of radius 1. */
const GLYPH_POLYS = {
  diamond: [0, -1.15, 1.15, 0, 0, 1.15, -1.15, 0],
  // Twelve points alternating between the teeth and the gaps between them.
  gear: Array.from({ length: 12 }, (_, k) => {
    const a = (k * Math.PI) / 6;
    const rr = k % 2 ? 0.75 : 1.15;
    return [Math.cos(a) * rr, Math.sin(a) * rr];
  }).flat(),
  flask: [-0.35, -1.1, 0.35, -1.1, 0.35, -0.3, 1.05, 1, -1.05, 1, -0.35, -0.3],
} satisfies Record<Exclude<GlyphShape, "circle" | "square">, number[]>;

/** Adds a card's soft shadow: stacked, fading rounded rects below it. */
function drawShadow(g: Graphics, { x, y, w, h }: Rect, radius: number): void {
  for (let i = 3; i >= 1; i--) {
    const spread = i * 1.5;
    g.roundRect(
      x - spread,
      y - spread + 3,
      w + 2 * spread,
      h + 2 * spread,
      radius + spread,
    ).fill({ color: PALETTE.shadow, alpha: 0.12 });
  }
}

/** The Core as a node card: category header with its name, body, connectors. */
export function drawCore(map: MapView): Container {
  const { x, y, w, h } = toWorld(map.core);
  const radius = PALETTE.cardRadius * CELL_PX;
  const header = CELL_PX * 0.7;
  const card = new Container({ label: "core" });
  const g = card.addChild(new Graphics());
  drawShadow(g, { x, y, w, h }, radius);
  g.roundRect(x, y, w, h, radius).fill(PALETTE.card);
  // The header's top corners follow the card; its bottom edge is square.
  g.roundRect(x, y, w, header, radius)
    .rect(x, y + header / 2, w, header / 2)
    .fill(CATEGORY_COLOR.core);

  // A hexagon stands in for the Core's icon.
  const cx = x + w / 2;
  const cy = y + header + (h - header) / 2;
  const r = Math.min(w, h - header) * 0.25;
  const hex: number[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    hex.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  g.poly(hex).stroke({ color: PALETTE.dimText, width: 2 });

  // An input connector on the left, an output connector on the right.
  const cr = CELL_PX * 0.16;
  g.circle(x, cy, cr)
    .fill(PALETTE.ground)
    .stroke({ color: PALETTE.inputRing, width: 1.4 });
  g.circle(x + w, cy, cr).fill(PALETTE.output);

  card.addChild(
    headerLabel(
      strings.map.core,
      x + CELL_PX * 0.3,
      y + header / 2,
      header * 0.6,
    ),
  );
  return card;
}

/**
 * Header text `size` world units tall, rasterised at the largest zoom so it
 * stays sharp when the camera zooms in.
 */
function headerLabel(label: string, x: number, y: number, size: number): Text {
  const scale = MAX_ZOOM_SCALE;
  const text = new Text({
    text: label,
    style: {
      fontFamily: "system-ui, sans-serif",
      fontWeight: "700",
      fontSize: size * scale,
      fill: PALETTE.headerText,
    },
  });
  text.scale.set(1 / scale);
  text.anchor.set(0, 0.5);
  text.position.set(x, y);
  return text;
}
