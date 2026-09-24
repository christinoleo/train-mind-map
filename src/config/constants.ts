/** Length of one simulation tick. The simulation runs at 10 ticks per second. */
export const TICK_MS = 100;

/** Most ticks the main-thread loop runs in one frame before carrying the rest over. */
export const MAX_TICKS_PER_FRAME = 5;

/**
 * Most unsimulated time the loop keeps as backlog. Longer gaps, such as a
 * backgrounded tab, go through the offline path instead of live catch-up.
 */
export const MAX_BACKLOG_MS = 10_000;

/** Depth of the undo stack. */
export const UNDO_DEPTH = 20;

/** Side of the square map, in cells. The whole map is generated at start. */
export const MAP_SIZE = 120;

/** Side of the area revealed at start (ring 0), in cells, centred on the map. */
export const INITIAL_REVEALED_SIZE = 48;

/** Cells each expansion ring adds to every side of the revealed area. */
export const RING_STEP = 12;

/** World units per map cell. The camera scales the world to the screen. */
export const CELL_PX = 16;

/** Screen pixels a pointer may move before a touch counts as a drag, not a tap. */
export const DRAG_THRESHOLD_PX = 8;

/** Time a pointer must stay within `DRAG_THRESHOLD_PX` to count as a long press. */
export const LONG_PRESS_MS = 500;

/** Most screen pixels per map cell the camera zooms in to. */
export const MAX_ZOOM_CELL_PX = 96;

/**
 * Level-of-detail thresholds, in screen pixels per map cell. Below
 * `LOD_GRAPH_CELL_PX` the map shows the overview; from `LOD_ICONS_CELL_PX`
 * up, items carry their icons.
 */
export const LOD_GRAPH_CELL_PX = 6;
export const LOD_ICONS_CELL_PX = 24;

/** Screen pixels the camera lets the view run past the revealed map. */
export const CAMERA_EDGE_PAD_PX = 24;

/** Width of the screen band where a drag tool pans the camera automatically. */
export const AUTO_PAN_EDGE_PX = 48;

/** Camera speed, in screen pixels per second, with the pointer at the screen's edge. */
export const AUTO_PAN_SPEED_PX_S = 600;
