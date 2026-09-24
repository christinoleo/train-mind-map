import {
  CAMERA_EDGE_PAD_PX,
  CELL_PX,
  LOD_GRAPH_CELL_PX,
  LOD_ICONS_CELL_PX,
  MAX_ZOOM_SCALE,
} from "../config/constants";
import type { Rect } from "../sim/geometry/rect";
import { clamp } from "../sim/math";

/** Share of the screen the fitted area fills, leaving a margin around it. */
export const FIT_MARGIN = 0.92;

export interface CameraFit {
  scale: number;
  x: number;
  y: number;
}

/**
 * Scale and offset that centre `area` (in world units) on a screen of
 * `width` × `height` pixels, as large as fits.
 */
export function fitArea(area: Rect, width: number, height: number): CameraFit {
  const scale = Math.min(width / area.w, height / area.h) * FIT_MARGIN;
  return {
    scale,
    x: width / 2 - (area.x + area.w / 2) * scale,
    y: height / 2 - (area.y + area.h / 2) * scale,
  };
}

/** Level of detail, from farthest to closest (FR13). */
export type Lod = "overview" | "graph" | "icons";

/** The level of detail at `scale` screen pixels per world unit. */
export function lodAt(scale: number): Lod {
  const cellPx = scale * CELL_PX;
  if (cellPx < LOD_GRAPH_CELL_PX) return "overview";
  if (cellPx < LOD_ICONS_CELL_PX) return "graph";
  return "icons";
}

/**
 * Where the world sits on the screen: a world point `p` is drawn at
 * `p * scale + (x, y)`. Zoom runs from the whole revealed map fitted on the
 * screen to `MAX_ZOOM_CELL_PX`, and the view never strays more than
 * `CAMERA_EDGE_PAD_PX` past the map's edge.
 */
export class Camera {
  scale = 1;
  x = 0;
  y = 0;
  private width = 0;
  private height = 0;
  private bounds: Rect | null = null;
  /** Farthest zoom: the whole revealed map on screen. Updated with the viewport and bounds. */
  private minScale = 0;

  get lod(): Lod {
    return lodAt(this.scale);
  }

  /** Resizes the screen, keeping the world point at its centre in place. */
  setViewport(width: number, height: number) {
    if (width === this.width && height === this.height) return;
    this.x += (width - this.width) / 2;
    this.y += (height - this.height) / 2;
    this.width = width;
    this.height = height;
    this.updateMinScale();
    this.clamp();
  }

  /** Sets the revealed map, in world units, and fits it on screen if asked. */
  setBounds(bounds: Rect, fit: boolean) {
    this.bounds = bounds;
    this.updateMinScale();
    if (fit && this.hasView()) {
      Object.assign(this, fitArea(bounds, this.width, this.height));
    }
    this.clamp();
  }

  panBy(dx: number, dy: number) {
    this.x += dx;
    this.y += dy;
    this.clamp();
  }

  /** Scales by `factor`, keeping the world point under the screen point in place. */
  zoomAt(screenX: number, screenY: number, factor: number) {
    const before = this.scale;
    this.scale = clamp(before * factor, this.minScale, MAX_ZOOM_SCALE);
    const k = this.scale / before;
    this.x = screenX - (screenX - this.x) * k;
    this.y = screenY - (screenY - this.y) * k;
    this.clamp();
  }

  /** Puts the world point (`worldX`, `worldY`) at the screen's centre. */
  centerOn(worldX: number, worldY: number) {
    this.x = this.width / 2 - worldX * this.scale;
    this.y = this.height / 2 - worldY * this.scale;
    this.clamp();
  }

  /** The world point drawn at a screen point. */
  toWorld(screenX: number, screenY: number): { x: number; y: number } {
    return {
      x: (screenX - this.x) / this.scale,
      y: (screenY - this.y) / this.scale,
    };
  }

  /** The screen point where the world point (`worldX`, `worldY`) is drawn. */
  toScreen(worldX: number, worldY: number): { x: number; y: number } {
    return {
      x: worldX * this.scale + this.x,
      y: worldY * this.scale + this.y,
    };
  }

  /** The world rect on screen, in world units. */
  viewRect(): Rect {
    const { x, y } = this.toWorld(0, 0);
    return { x, y, w: this.width / this.scale, h: this.height / this.scale };
  }

  private hasView(): boolean {
    return this.width > 0 && this.height > 0;
  }

  private updateMinScale() {
    this.minScale =
      this.bounds && this.hasView()
        ? Math.min(
            fitArea(this.bounds, this.width, this.height).scale,
            MAX_ZOOM_SCALE,
          )
        : 0;
  }

  private clamp() {
    const { bounds } = this;
    if (!bounds || !this.hasView()) return;
    this.scale = clamp(this.scale, this.minScale, MAX_ZOOM_SCALE);
    this.x = clampAxis(this.x, bounds.x, bounds.w, this.scale, this.width);
    this.y = clampAxis(this.y, bounds.y, bounds.h, this.scale, this.height);
  }
}

/**
 * The offset on one axis: a map narrower than the screen is centred, a wider
 * one may pan until its edge is `CAMERA_EDGE_PAD_PX` inside the screen.
 */
function clampAxis(
  offset: number,
  start: number,
  size: number,
  scale: number,
  screen: number,
): number {
  const pad = CAMERA_EDGE_PAD_PX;
  const onScreen = size * scale;
  if (onScreen <= screen - 2 * pad) {
    return (screen - onScreen) / 2 - start * scale;
  }
  return clamp(
    offset,
    screen - pad - (start + size) * scale,
    pad - start * scale,
  );
}
