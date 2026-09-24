import type { ItemCounts } from "../../data/items";
import type { Emit } from "../events";
import { buildPlanarIndex } from "../geometry/planar";
import { fail, ok, type Result } from "../result";
import { pathLength } from "../geometry/route";
import { checkRestore, edgeCost, pathBounds } from "../state/edges";
import type { Edge, GameState } from "../state/gameState";
import type { EdgeId } from "../state/ids";
import { canAfford, debit, deposit } from "../state/stock";
import type { Command } from "./command";

/**
 * Takes an edge out and puts its whole cost back into storage (FR59). Only
 * as much as storage has room for goes back; the rest is lost.
 */
export function takeOutEdge(state: GameState, edge: Edge): ItemCounts {
  state.edges.delete(edge.id);
  const cost = edgeCost(pathLength(edge.path), edge.level);
  return deposit(state, cost, pathBounds(edge.path));
}

/**
 * Puts a removed edge back, empty, with its id, route and level, taking back
 * what its removal refunded.
 */
export function putBackEdge(
  state: GameState,
  edge: Edge,
  refunded: ItemCounts,
  emit: Emit,
): void {
  const site = pathBounds(edge.path);
  const draws = debit(state, refunded, site);
  state.edges.set(edge.id, {
    ...edge,
    path: structuredClone(edge.path),
    items: [],
  });
  emit({ type: "ConstructionPaid", site, draws });
}

/**
 * Removes an edge and refunds its whole cost (FR59). The items on it are
 * lost, so its undo brings it back empty.
 */
export class RemoveEdge implements Command {
  readonly type = "RemoveEdge";
  private removed?: Edge;
  private refunded?: ItemCounts;

  constructor(readonly id: EdgeId) {}

  validate(state: Readonly<GameState>): Result {
    return state.edges.has(this.id) ? ok() : fail("not_found");
  }

  apply(state: GameState) {
    const edge = state.edges.get(this.id)!;
    this.removed = edge;
    this.refunded = takeOutEdge(state, edge);
  }

  invert(): Command {
    if (!this.removed || !this.refunded) {
      throw new Error("RemoveEdge was not applied");
    }
    return new RestoreEdge(this.removed, this.refunded);
  }
}

/** Puts a removed edge back as it was, as the undo of `RemoveEdge`. */
class RestoreEdge implements Command {
  readonly type = "RestoreEdge";

  constructor(
    private readonly edge: Edge,
    private readonly refunded: ItemCounts,
  ) {}

  validate(state: Readonly<GameState>): Result {
    if (state.edges.has(this.edge.id)) return fail("occupied");
    if (!canAfford(state, this.refunded)) return fail("no_stock");
    return checkRestore(state, buildPlanarIndex(state), this.edge);
  }

  apply(state: GameState, emit: Emit) {
    putBackEdge(state, this.edge, this.refunded, emit);
  }

  invert(): Command {
    return new RemoveEdge(this.edge.id);
  }
}
