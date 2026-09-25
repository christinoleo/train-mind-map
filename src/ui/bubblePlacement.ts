import { clamp } from "../sim/math";

/** A box on the screen, in CSS pixels. */
export interface ScreenRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Where the bubble may go: the viewport less the HUD above and the palette below. */
export interface BubbleArea {
  width: number;
  height: number;
  /** The first row free of the HUD. */
  top: number;
  /** The last row free of the palette. */
  bottom: number;
}

export interface BubblePlacement {
  /** The bubble's top-left corner. */
  x: number;
  y: number;
  /** True when it sits below its anchor, its arrow pointing up. */
  below: boolean;
  /** The arrow's tip, from the bubble's left edge. */
  arrowX: number;
}

/** Room between the bubble and its anchor, which its arrow spans. */
export const BUBBLE_GAP_PX = 12;
/** The bubble keeps this far from the screen's sides. */
const SIDE_MARGIN_PX = 8;
/** The arrow keeps this far from the bubble's corners. */
const ARROW_INSET_PX = 16;

/**
 * Places a bubble of `size` next to `anchor` (FR19, FR59): above it, centred,
 * or below it when there is no room above, and always inside `area`. A
 * bubble with room on neither side goes where there is more, clamped. The
 * arrow points at the anchor's centre as nearly as the corners allow.
 */
export function placeBubble(
  anchor: ScreenRect,
  size: { w: number; h: number },
  area: BubbleArea,
): BubblePlacement {
  const above = anchor.y - BUBBLE_GAP_PX - size.h;
  const underneath = anchor.y + anchor.h + BUBBLE_GAP_PX;
  const fitsAbove = above >= area.top;
  const fitsBelow = underneath + size.h <= area.bottom;
  const below =
    !fitsAbove && (fitsBelow || area.bottom - underneath > anchor.y - area.top);
  const y = clamp(
    below ? underneath : above,
    area.top,
    Math.max(area.top, area.bottom - size.h),
  );
  const centre = anchor.x + anchor.w / 2;
  const x = clamp(
    centre - size.w / 2,
    SIDE_MARGIN_PX,
    Math.max(SIDE_MARGIN_PX, area.width - SIDE_MARGIN_PX - size.w),
  );
  const arrowX = clamp(
    centre - x,
    ARROW_INSET_PX,
    Math.max(ARROW_INSET_PX, size.w - ARROW_INSET_PX),
  );
  return { x, y, below, arrowX };
}
