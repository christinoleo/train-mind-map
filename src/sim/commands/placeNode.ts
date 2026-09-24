import type { RawResource } from "../../data/items";
import type { NodeKind } from "../../data/nodes";
import type { RecipeId } from "../../data/recipes";
import { fail, ok, type Result } from "../result";
import type { GameState } from "../state/gameState";
import { allocateId, type NodeId } from "../state/ids";
import { canRun, checkFootprint, createNode, isUnlocked } from "../state/nodes";
import type { Command } from "./command";
import { RemoveNode } from "./removeNode";

/**
 * Checks that the player may place a node of `kind` with its top-left cell
 * at (x, y): the kind is unlocked and the footprint fits. On success it
 * returns the resource under an Extractor.
 */
export function checkPlacement(
  state: Readonly<GameState>,
  kind: NodeKind,
  x: number,
  y: number,
): Result<RawResource | undefined> {
  if (!isUnlocked(state, kind)) return fail("locked");
  return checkFootprint(state, kind, x, y);
}

/**
 * Places a node of `kind` with its top-left cell at (x, y) (FR16–FR18). A
 * Furnace or Assembler may start with a chosen recipe (FR27).
 */
export class PlaceNode implements Command {
  readonly type = "PlaceNode";
  private placed?: NodeId;

  constructor(
    readonly kind: NodeKind,
    readonly x: number,
    readonly y: number,
    readonly recipe?: RecipeId,
  ) {}

  validate(state: Readonly<GameState>): Result {
    if (this.recipe && !canRun(this.kind, this.recipe)) {
      return fail("wrong_recipe");
    }
    const fits = checkPlacement(state, this.kind, this.x, this.y);
    return fits.ok ? ok() : fail(fits.reason);
  }

  apply(state: GameState) {
    const fits = checkFootprint(state, this.kind, this.x, this.y);
    if (!fits.ok) throw new Error("PlaceNode applied without validating");
    const id = allocateId(state.nextIds, "node");
    state.nodes.set(
      id,
      createNode(id, this.kind, this.x, this.y, {
        resource: fits.value,
        recipe: this.recipe,
      }),
    );
    this.placed = id;
  }

  invert(): Command {
    if (this.placed === undefined) throw new Error("PlaceNode was not applied");
    return new RemoveNode(this.placed);
  }
}
