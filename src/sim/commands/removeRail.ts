import type { ItemCounts } from "../../data/items";
import type { Emit } from "../events";
import { fail, ok, type Result } from "../result";
import {
  buildRailGrid,
  checkRailRestore,
  railCost,
  railLength,
} from "../rail/rails";
import { pathBounds } from "../state/edges";
import type { FactoryNode, GameState, Rail } from "../state/gameState";
import type { RailId } from "../state/ids";
import { isRailInUse } from "../rail/trains";
import { canAfford, debit, deposit } from "../state/stock";
import type { Command } from "./command";

/**
 * Takes a rail out and puts its whole cost back into storage. Only as much
 * as storage has room for goes back; the rest is lost.
 */
export function takeOutRail(state: GameState, rail: Rail): ItemCounts {
  state.rails.delete(rail.id);
  return deposit(state, railCost(railLength(rail.path)), pathBounds(rail.path));
}

/** Puts a removed rail back, taking back what its removal refunded. */
export function putBackRail(
  state: GameState,
  rail: Rail,
  refunded: ItemCounts,
  emit: Emit,
): void {
  const site = pathBounds(rail.path);
  const draws = debit(state, refunded, site);
  state.rails.set(rail.id, structuredClone(rail));
  emit({ type: "ConstructionPaid", site, draws });
}

/**
 * Checks that removed rails can come back: they fit as they were, and
 * storage holds what their removal refunded. `extra` counts as a node.
 */
export function checkPutBackRails(
  state: Readonly<GameState>,
  rails: readonly Rail[],
  extra?: FactoryNode,
): Result {
  const grid = buildRailGrid(state);
  for (const rail of rails) {
    if (state.rails.has(rail.id)) return fail("occupied");
    const back = checkRailRestore(state, rail, extra, grid);
    if (!back.ok) return back;
  }
  return ok();
}

/** Removes a rail and refunds its whole cost. */
export class RemoveRail implements Command {
  readonly type = "RemoveRail";
  private removed?: Rail;
  private refunded?: ItemCounts;

  constructor(readonly id: RailId) {}

  validate(state: Readonly<GameState>): Result {
    if (!state.rails.has(this.id)) return fail("not_found");
    return isRailInUse(state, this.id) ? fail("has_trains") : ok();
  }

  apply(state: GameState) {
    const rail = state.rails.get(this.id)!;
    this.removed = rail;
    this.refunded = takeOutRail(state, rail);
  }

  invert(): Command {
    if (!this.removed || !this.refunded) {
      throw new Error("RemoveRail was not applied");
    }
    return new RestoreRail(this.removed, this.refunded);
  }
}

/** Puts a removed rail back as it was, as the undo of `RemoveRail`. */
class RestoreRail implements Command {
  readonly type = "RestoreRail";

  constructor(
    private readonly rail: Rail,
    private readonly refunded: ItemCounts,
  ) {}

  validate(state: Readonly<GameState>): Result {
    if (!canAfford(state, this.refunded)) return fail("no_stock");
    return checkPutBackRails(state, [this.rail]);
  }

  apply(state: GameState, emit: Emit) {
    putBackRail(state, this.rail, this.refunded, emit);
  }

  invert(): Command {
    return new RemoveRail(this.rail.id);
  }
}
