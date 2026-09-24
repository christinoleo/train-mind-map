import type { ItemCounts } from "../../data/items";
import type { Emit } from "../events";
import { fail, ok, type Result } from "../result";
import { canHold, releaseWhere } from "../rail/reservation";
import { trainCost } from "../rail/trains";
import { lineOf } from "../rail/lines";
import type { GameState, Train } from "../state/gameState";
import type { TrainId } from "../state/ids";
import { nodeRect } from "../state/nodes";
import { canAfford, debit, deposit } from "../state/stock";
import type { Command } from "./command";

/** Where a train's refund goes and its rebuild is paid from: its next stop. */
function siteOf(state: Readonly<GameState>, train: Readonly<Train>) {
  const stop = state.lines.get(train.line)?.stops[train.stop];
  const station = stop && state.nodes.get(stop.station);
  return station ? nodeRect(station) : state.map.core;
}

/**
 * Takes a train off the rails, wherever it is, and puts its whole cost back
 * into storage. Only as much as storage has room for goes back.
 */
export class RemoveTrain implements Command {
  readonly type = "RemoveTrain";
  private removed?: Train;
  private refunded?: ItemCounts;

  constructor(readonly id: TrainId) {}

  validate(state: Readonly<GameState>): Result {
    return state.trains.has(this.id) ? ok() : fail("not_found");
  }

  apply(state: GameState) {
    const train = state.trains.get(this.id)!;
    this.removed = structuredClone(train);
    releaseWhere(state, train, () => true);
    state.trains.delete(this.id);
    this.refunded = deposit(
      state,
      trainCost(train.wagons.length),
      siteOf(state, train),
    );
  }

  invert(): Command {
    if (!this.removed || !this.refunded) {
      throw new Error("RemoveTrain was not applied");
    }
    return new RestoreTrain(this.removed, this.refunded);
  }
}

/**
 * Puts a removed train back as it was, as the undo of `RemoveTrain`: its
 * Line must still run, what it held must still be free, and the stock must
 * pay back its refund, unless `stock` leaves that to the caller.
 */
export class RestoreTrain implements Command {
  readonly type = "RestoreTrain";

  constructor(
    private readonly train: Train,
    readonly refunded: ItemCounts,
  ) {}

  validate(state: Readonly<GameState>, stock = true): Result {
    if (state.trains.has(this.train.id)) return fail("occupied");
    if (!state.lines.has(this.train.line)) return fail("not_found");
    if (
      lineOf(state, this.train).stops.some((s) => !state.nodes.has(s.station))
    ) {
      return fail("not_found");
    }
    const legs = this.train.trip?.legs ?? [];
    if (
      this.train.station === null &&
      legs.some((l) => !state.rails.has(l.rail))
    ) {
      return fail("no_route");
    }
    const keys = this.train.holds.map((h) => h.key);
    if (!canHold(state, this.train.id, keys)) return fail("occupied");
    if (!stock) return ok();
    return canAfford(state, this.refunded) ? ok() : fail("no_stock");
  }

  apply(state: GameState, emit: Emit) {
    const train = structuredClone(this.train);
    const site = siteOf(state, train);
    const draws = debit(state, this.refunded, site);
    state.trains.set(train.id, train);
    for (const { key } of train.holds) state.reservations.set(key, train.id);
    emit({ type: "ConstructionPaid", site, draws });
  }

  invert(): Command {
    return new RemoveTrain(this.train.id);
  }
}
