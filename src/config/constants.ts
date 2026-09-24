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

/** Seed of the fixed MVP map. */
export const DEFAULT_SEED = "train-mind-map";
