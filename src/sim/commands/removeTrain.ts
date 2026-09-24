import type { ItemCounts } from "../../data/items";
import type { Emit } from "../events";
import { fail, ok, type Result } from "../result";
import { canHold, releaseWhere } from "../rail/reservation";
import { trainCost } from "../rail/trains";
import type { GameState, Train } from "../state/gameState";
import type { TrainId } from "../state/ids";
import { nodeRect } from "../state/nodes";
import { canAfford, debit, deposit } from "../state/stock";
import type { Command } from "./command";

/** Where a train's refund goes and its rebuild is paid from: its next stop. */
function siteOf(state: Readonly<GameState>, train: Readonly<Train>) {
  const station = state.nodes.get(train.stops[train.stop]);
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
      trainCost(train.wagons),
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
 * Puts a removed train back as it was, as the undo of `RemoveTrain`: what
 * it held must still be free, and its stops still stand.
 */
class RestoreTrain implements Command {
  readonly type = "RestoreTrain";

  constructor(
    private readonly train: Train,
    private readonly refunded: ItemCounts,
  ) {}

  validate(state: Readonly<GameState>): Result {
    if (state.trains.has(this.train.id)) return fail("occupied");
    if (this.train.stops.some((id) => !state.nodes.has(id))) {
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
