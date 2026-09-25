import { MVP_WAGONS } from "../../data/rail";
import type { Emit } from "../events";
import { fail, ok, type Result } from "../result";
import { networkFull } from "../rail/lines";
import { platformKey } from "../rail/segments";
import { createTrain, trainCost } from "../rail/trains";
import type { GameState } from "../state/gameState";
import { allocateId, type LineId, type TrainId } from "../state/ids";
import { nodeRect } from "../state/nodes";
import { canAfford, debit } from "../state/stock";
import type { Command } from "./command";
import { RemoveTrain } from "./removeTrain";

/** The first stop of `line` whose platform no train holds, if any. */
function freeStop(state: Readonly<GameState>, line: LineId): number {
  const stops = state.lines.get(line)?.stops ?? [];
  return stops.findIndex(
    (s) => !state.reservations.has(platformKey(s.station)),
  );
}

/**
 * Builds a train, a locomotive and `MVP_WAGONS` wagons, paid from the global
 * stock (FR88), on `line` (the Line panel's "+ trem"). It stands at the
 * Line's first stop with a free platform, and follows the Line from there.
 * A Station has one platform, so the Lines sharing Stations keep one
 * Station more than they have trains: with every platform held, no train
 * could reserve its next stop.
 */
export class PlaceTrain implements Command {
  readonly type = "PlaceTrain";
  private built?: TrainId;

  constructor(readonly line: LineId) {}

  validate(state: Readonly<GameState>): Result {
    const line = state.lines.get(this.line);
    if (!line) return fail("not_found");
    if (
      networkFull(
        state,
        line.stops.map((s) => s.station),
      )
    ) {
      return fail("line_full");
    }
    if (freeStop(state, this.line) < 0) return fail("occupied");
    return canAfford(state, trainCost(MVP_WAGONS)) ? ok() : fail("no_stock");
  }

  apply(state: GameState, emit: Emit) {
    const stop = freeStop(state, this.line);
    const station = state.nodes.get(
      state.lines.get(this.line)!.stops[stop].station,
    );
    if (!station) throw new Error("PlaceTrain applied without validating");
    const id = allocateId(state.nextIds, "train");
    const site = nodeRect(station);
    const draws = debit(state, trainCost(MVP_WAGONS), site);
    createTrain(state, id, this.line, stop, MVP_WAGONS);
    this.built = id;
    emit({ type: "ConstructionPaid", site, draws });
  }

  invert(): Command {
    if (this.built === undefined) throw new Error("PlaceTrain was not applied");
    return new RemoveTrain(this.built);
  }
}
