import { MVP_WAGONS } from "../../data/rail";
import type { Emit } from "../events";
import { fail, ok, type Result } from "../result";
import { findRoute, platformKey } from "../rail/segments";
import { createTrain, trainCost } from "../rail/trains";
import type { GameState } from "../state/gameState";
import { allocateId, type NodeId, type TrainId } from "../state/ids";
import { nodeRect } from "../state/nodes";
import { canAfford, debit } from "../state/stock";
import type { Command } from "./command";
import { RemoveTrain } from "./removeTrain";

/**
 * Checks that a train may run over `stops`, in order and round again: each
 * is a Station, it differs from the one before, and a route leads there.
 */
function checkStops(
  state: Readonly<GameState>,
  stops: readonly NodeId[],
): Result {
  if (stops.length < 2) return fail("no_route");
  for (const id of stops) {
    if (state.nodes.get(id)?.kind !== "station") return fail("not_found");
  }
  for (let i = 0; i < stops.length; i++) {
    const next = stops[(i + 1) % stops.length];
    if (stops[i] === next) return fail("same_node");
    if (!findRoute(state, stops[i], next)) return fail("no_route");
  }
  return ok();
}

/**
 * Builds a train, a locomotive and `MVP_WAGONS` wagons, paid from the global
 * stock (FR88). It stands at the first of `stops`, whose platform must be
 * free, and runs over them in order, round and round.
 */
export class PlaceTrain implements Command {
  readonly type = "PlaceTrain";
  private built?: TrainId;

  constructor(readonly stops: readonly NodeId[]) {}

  validate(state: Readonly<GameState>): Result {
    const stops = checkStops(state, this.stops);
    if (!stops.ok) return stops;
    if (state.reservations.has(platformKey(this.stops[0]))) {
      return fail("occupied");
    }
    return canAfford(state, trainCost(MVP_WAGONS)) ? ok() : fail("no_stock");
  }

  apply(state: GameState, emit: Emit) {
    const station = state.nodes.get(this.stops[0]);
    if (!station) throw new Error("PlaceTrain applied without validating");
    const id = allocateId(state.nextIds, "train");
    const site = nodeRect(station);
    const draws = debit(state, trainCost(MVP_WAGONS), site);
    createTrain(state, id, this.stops, MVP_WAGONS);
    this.built = id;
    emit({ type: "ConstructionPaid", site, draws });
  }

  invert(): Command {
    if (this.built === undefined) throw new Error("PlaceTrain was not applied");
    return new RemoveTrain(this.built);
  }
}
