import { MIN_TOUCH_PX } from "../config/constants";
import type { Rect } from "../sim/geometry/rect";

/**
 * True when world point (`x`, `y`) falls on `rect`, in world units, grown
 * about its centre to at least `MIN_TOUCH_PX` screen pixels per side at
 * `scale` screen pixels per world unit, so small targets stay tappable at
 * any zoom (FR133).
 */
export function hitsRect(rect: Rect, x: number, y: number, scale: number) {
  const min = MIN_TOUCH_PX / scale;
  const w = Math.max(rect.w, min);
  const h = Math.max(rect.h, min);
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  return Math.abs(x - cx) <= w / 2 && Math.abs(y - cy) <= h / 2;
}
