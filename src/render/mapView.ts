import { Graphics } from "pixi.js";
import { MAP_SIZE } from "../config/constants";
import type { Rect } from "../sim/geometry/rect";
import {
  cellIndex,
  revealedSize,
  Terrain,
  type GameMap,
} from "../sim/state/map";
import type { DeepReadonly } from "./readonly";
import {
  BLUEPRINT,
  CELL_PX,
  RESOURCE_STYLE,
  toWorld,
  type ResourceShape,
} from "./theme";

type MapView = DeepReadonly<GameMap>;

/** The revealed square, in cells. Nothing outside it is drawn. */
export function revealedBounds(map: MapView): Rect {
  const side = Math.min(revealedSize(map.revealedRing), MAP_SIZE);
  const start = (MAP_SIZE - side) / 2;
  return { x: start, y: start, w: side, h: side };
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

function cellRect(g: Graphics, r: Rect): Graphics {
  const { x, y, w, h } = toWorld(r);
  return g.rect(x, y, w, h);
}

/** Land, lakes, the cell grid and a frame around the revealed area. */
export function drawTerrain(map: MapView, bounds: Rect): Graphics {
  const g = new Graphics({ label: "terrain" });
  cellRect(g, bounds).fill(BLUEPRINT.land);
  for (const run of waterRuns(map, bounds)) cellRect(g, run);
  g.fill(BLUEPRINT.water);

  const world = toWorld(bounds);
  const x0 = world.x;
  const y0 = world.y;
  const x1 = x0 + world.w;
  const y1 = y0 + world.h;
  for (const major of [false, true]) {
    g.beginPath();
    for (let i = 1; i < bounds.w; i++) {
      if (((bounds.x + i) % BLUEPRINT.majorEvery === 0) !== major) continue;
      const x = x0 + i * CELL_PX;
      g.moveTo(x, y0).lineTo(x, y1);
    }
    for (let i = 1; i < bounds.h; i++) {
      if (((bounds.y + i) % BLUEPRINT.majorEvery === 0) !== major) continue;
      const y = y0 + i * CELL_PX;
      g.moveTo(x0, y).lineTo(x1, y);
    }
    g.stroke({
      color: BLUEPRINT.grid,
      alpha: major ? BLUEPRINT.majorGridAlpha : BLUEPRINT.gridAlpha,
      pixelLine: true,
    });
  }
  cellRect(g, bounds).stroke({ color: BLUEPRINT.border, width: 2 });
  return g;
}

/** Each revealed deposit: a tinted patch with its resource's icon. */
export function drawDeposits(map: MapView, bounds: Rect): Graphics {
  const g = new Graphics({ label: "deposits" });
  for (const deposit of map.deposits) {
    if (!isInside(deposit, bounds)) continue;
    const { color, shape } = RESOURCE_STYLE[deposit.resource];
    cellRect(g, deposit)
      .fill({ color, alpha: 0.22 })
      .stroke({ color, width: 2, alignment: 1 });
    const cx = (deposit.x + deposit.w / 2) * CELL_PX;
    const cy = (deposit.y + deposit.h / 2) * CELL_PX;
    const r = Math.min(deposit.w, deposit.h) * CELL_PX * 0.28;
    drawIcon(g, shape, cx, cy, r)
      .fill(color)
      .stroke({ color: BLUEPRINT.background, width: 2 });
  }
  return g;
}

/** Adds the path of a placeholder resource icon of radius `r`. */
function drawIcon(
  g: Graphics,
  shape: ResourceShape,
  cx: number,
  cy: number,
  r: number,
): Graphics {
  switch (shape) {
    case "square":
      return g.rect(cx - r * 0.8, cy - r * 0.8, r * 1.6, r * 1.6);
    case "circle":
      return g.circle(cx, cy, r * 0.9);
    case "triangle":
      return g.poly([cx, cy - r, cx + r, cy + r * 0.8, cx - r, cy + r * 0.8]);
    case "diamond":
      return g.poly([cx, cy - r, cx + r, cy, cx, cy + r, cx - r, cy]);
    case "drop":
      return g
        .moveTo(cx, cy - r)
        .arc(cx, cy + r * 0.3, r * 0.65, -Math.PI / 6, (Math.PI * 7) / 6)
        .closePath();
  }
}

/** The Core as a placeholder node card: header, body and connectors. */
export function drawCore(map: MapView): Graphics {
  const { x: px, y: py, w: pw, h: ph } = toWorld(map.core);
  const header = ph * 0.3;
  const g = new Graphics({ label: "core" });
  g.roundRect(px, py, pw, ph, 4).fill(BLUEPRINT.coreBody);
  g.rect(px, py, pw, header).fill(BLUEPRINT.coreHeader);
  g.roundRect(px, py, pw, ph, 4).stroke({ color: BLUEPRINT.ink, width: 2 });
  // A hexagon stands in for the Core's icon.
  const cx = px + pw / 2;
  const cy = py + header + (ph - header) / 2;
  const r = Math.min(pw, ph - header) * 0.28;
  const hex: number[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    hex.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  g.poly(hex).stroke({ color: BLUEPRINT.ink, width: 2 });
  // Input connectors on the left, output connectors on the right.
  for (const side of [px, px + pw]) {
    g.circle(side, cy, CELL_PX * 0.16)
      .fill(BLUEPRINT.background)
      .stroke({ color: BLUEPRINT.ink, width: 1.5 });
  }
  return g;
}
