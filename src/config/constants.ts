/** Length of one simulation tick. The simulation runs at 10 ticks per second. */
export const TICK_MS = 100;

/** Most ticks the main-thread loop runs in one frame before carrying the rest over. */
export const MAX_TICKS_PER_FRAME = 5;

/**
 * Most unsimulated time the loop keeps as backlog. Longer gaps, such as a
 * backgrounded tab, go through the offline path instead of live catch-up.
 */
export const MAX_BACKLOG_MS = 10_000;

/** How often the UI bridge publishes the state summary to the HUD (4 Hz). */
export const UI_PUBLISH_MS = 250;

/** How long a refused action's reason stays on screen. */
export const HINT_MS = 2500;

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

/** Closest zoom, in screen pixels per world unit. */
export const MAX_ZOOM_SCALE = MAX_ZOOM_CELL_PX / CELL_PX;

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

/**
 * Prefix of every localStorage key and IndexedDB database the game creates.
 * On itch.io all games share one storage origin, so unprefixed names collide.
 * No key includes the build path, so saves survive new uploads.
 */
export const STORAGE_PREFIX = "train-mind-map:";

/** Smallest side of anything tappable, in screen pixels, at any zoom (FR133). */
export const MIN_TOUCH_PX = 44;

/**
 * Side of a spatial-hash bucket, in cells. The planar index files edge
 * segments, node rects and water under every bucket they touch.
 */
export const HASH_BUCKET_CELLS = 8;

/**
 * Integer steps per cell that item positions on edges count in. At 3 cells/s
 * and 2, 4 or 8 items/s, both the distance an item moves per tick and the
 * spacing between items come out whole, so flow stays exact.
 */
export const FLOW_UNITS_PER_CELL = 40;
