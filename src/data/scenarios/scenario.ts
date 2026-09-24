import type { RawResource } from "../items";

/** A block of cells: top-left cell, width and height. */
export interface CellBlock {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface DepositPlacement extends CellBlock {
  readonly resource: RawResource;
}

/**
 * A fixed layout stamped over the terrain that `seed` generates. The Core and
 * the deposits replace the generated ones; `water` is stamped first and
 * `land` after it, so a land block can cut a gap through a water block.
 */
export interface Scenario {
  readonly seed: string;
  /** The outermost revealed ring at start. */
  readonly revealedRing: number;
  readonly core: CellBlock;
  readonly deposits: readonly DepositPlacement[];
  readonly water: readonly CellBlock[];
  readonly land: readonly CellBlock[];
}
