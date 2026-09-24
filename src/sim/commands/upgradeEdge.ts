import type { EdgeLevel } from "../../data/edges";
import type { Emit } from "../events";
import { fail, ok, type Result } from "../result";
import { pathLength } from "../geometry/route";
import { pathBounds, upgradeCost } from "../state/edges";
import type { GameState } from "../state/gameState";
import type { EdgeId } from "../state/ids";
import { canAfford, debit, deposit } from "../state/stock";
import type { Command } from "./command";

/**
 * Raises an edge to `level` in place, paying the difference in cost per cell
 * (FR58). Research gates the levels above 1. The route stays as it is: a
 * higher level only allows longer edges.
 */
export class UpgradeEdge implements Command {
  readonly type = "UpgradeEdge";
  private from?: EdgeLevel;

  constructor(
    readonly id: EdgeId,
    readonly level: EdgeLevel,
  ) {}

  validate(state: Readonly<GameState>): Result {
    const edge = state.edges.get(this.id);
    if (!edge) return fail("not_found");
    if (this.level <= edge.level) return fail("max_level");
    if (this.level > state.edgeLevel) return fail("locked");
    const cost = upgradeCost(pathLength(edge.path), edge.level, this.level);
    return canAfford(state, cost) ? ok() : fail("no_stock");
  }

  apply(state: GameState, emit: Emit) {
    const edge = state.edges.get(this.id)!;
    const cost = upgradeCost(pathLength(edge.path), edge.level, this.level);
    const site = pathBounds(edge.path);
    const draws = debit(state, cost, site);
    this.from = edge.level;
    // A new object, so the renderer sees the change.
    state.edges.set(this.id, { ...edge, level: this.level });
    emit({ type: "ConstructionPaid", site, draws });
  }

  invert(): Command {
    if (this.from === undefined) throw new Error("UpgradeEdge was not applied");
    return new DowngradeEdge(this.id, this.level, this.from);
  }
}

/**
 * Lowers an edge back from level `from` to `to`, as the undo of
 * `UpgradeEdge`, refunding the difference.
 */
class DowngradeEdge implements Command {
  readonly type = "DowngradeEdge";

  constructor(
    private readonly id: EdgeId,
    private readonly from: EdgeLevel,
    private readonly to: EdgeLevel,
  ) {}

  validate(state: Readonly<GameState>): Result {
    const edge = state.edges.get(this.id);
    return edge?.level === this.from ? ok() : fail("not_found");
  }

  apply(state: GameState) {
    const edge = state.edges.get(this.id)!;
    const refund = upgradeCost(pathLength(edge.path), this.to, this.from);
    deposit(state, refund, pathBounds(edge.path));
    state.edges.set(this.id, { ...edge, level: this.to });
  }
}
