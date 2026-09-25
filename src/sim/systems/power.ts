import { powerGrid } from "../state/power";
import type { System } from "../tick";

/**
 * The first system of the tick: sets the grid's satisfaction from the
 * previous tick's demand (FR61, FR64).
 */
export const power: System = (state) => powerGrid(state);
