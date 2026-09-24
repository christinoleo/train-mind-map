import type { Rect } from "../sim/geometry/rect";

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
