import type { RecipeId } from "../../data/recipes";
import { fail, ok, type Result } from "../result";
import type { GameState } from "../state/gameState";
import type { NodeId } from "../state/ids";
import { canRun } from "../state/nodes";
import { isCrafter, newProduction } from "../state/production";
import type { Command } from "./command";

/**
 * Sets the recipe a Furnace or Assembler runs (FR27). Changing it loses the
 * items inside the node, so its undo sets the old recipe back on empty
 * buffers. `null` leaves it without one: a Furnace then picks its recipe
 * from its first input, and an Assembler idles.
 */
export class SetRecipe implements Command {
  readonly type = "SetRecipe";
  private from?: RecipeId | null;

  constructor(
    readonly id: NodeId,
    readonly recipe: RecipeId | null,
  ) {}

  validate(state: Readonly<GameState>): Result {
    const node = state.nodes.get(this.id);
    if (!node || !isCrafter(node)) return fail("not_found");
    // `null` clears the recipe: a new Assembler has none, so its undo needs it.
    return this.recipe === null || canRun(node.kind, this.recipe)
      ? ok()
      : fail("wrong_recipe");
  }

  apply(state: GameState) {
    const node = state.nodes.get(this.id)!;
    if (!isCrafter(node))
      throw new Error("SetRecipe applied without validating");
    this.from = node.recipe;
    state.nodes.set(this.id, {
      ...node,
      recipe: this.recipe,
      production: newProduction(),
    });
  }

  invert(): Command {
    if (this.from === undefined) throw new Error("SetRecipe was not applied");
    return new SetRecipe(this.id, this.from);
  }
}
