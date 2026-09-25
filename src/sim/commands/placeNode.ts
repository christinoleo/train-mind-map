import { NODES, type NodeKind } from "../../data/nodes";
import type { RecipeId } from "../../data/recipes";
import type { Emit } from "../events";
import { fail, ok, type Result } from "../result";
import type { GameState } from "../state/gameState";
import type { Coverage } from "../state/map";
import { allocateId, type NodeId } from "../state/ids";
import {
  canRun,
  checkFootprint,
  createNode,
  footprint,
  isUnlocked,
} from "../state/nodes";
import { canAfford, debit } from "../state/stock";
import type { Command } from "./command";
import { RemoveNode } from "./removeNode";

/**
 * Checks that the player may place a node of `kind` with its top-left cell
 * at (x, y): the kind is unlocked, storage holds its cost and the footprint
 * fits. On success it returns the deposit cells under an Extractor.
 */
export function checkPlacement(
  state: Readonly<GameState>,
  kind: NodeKind,
  x: number,
  y: number,
): Result<Coverage[] | undefined> {
  if (!isUnlocked(state, kind)) return fail("locked");
  if (!canAfford(state, NODES[kind].cost)) return fail("no_stock");
  return checkFootprint(state, kind, x, y);
}

/**
 * Places a node of `kind` with its top-left cell at (x, y), paid from the
 * global stock (FR16–FR18, FR69). A Furnace or Assembler may start with a
 * chosen recipe (FR27).
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

  apply(state: GameState, emit: Emit) {
    const { kind, x, y } = this;
    const fits = checkFootprint(state, kind, x, y);
    if (!fits.ok) throw new Error("PlaceNode applied without validating");
    const id = allocateId(state.nextIds, "node");
    const site = footprint(kind, x, y);
    const draws = debit(state, NODES[kind].cost, site);
    state.nodes.set(
      id,
      createNode(id, kind, x, y, { coverage: fits.value, recipe: this.recipe }),
    );
    this.placed = id;
    emit({ type: "ConstructionPaid", site, draws });
  }

  invert(): Command {
    if (this.placed === undefined) throw new Error("PlaceNode was not applied");
    return new RemoveNode(this.placed);
  }
}
