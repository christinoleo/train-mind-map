import { DEFAULT_DEPARTURE, MVP_WAGONS } from "../../data/rail";
import type { Emit } from "../events";
import { fail, ok, type Result } from "../result";
import { findRoute, platformKey } from "../rail/segments";
import { trainCost } from "../rail/trains";
import type { GameState } from "../state/gameState";
import { allocateId, type LineId, type NodeId } from "../state/ids";
import { canAfford } from "../state/stock";
import type { Command } from "./command";
import { PlaceTrain } from "./placeTrain";
import { RemoveLine } from "./removeLine";

/**
 * Checks that a Line may run over `stops`, in order and round again: each
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
 * Creates a Line over the Stations `stops` (FR95), each stop with the
 * default departure condition, and builds its first train at the first
 * stop, as tapping two Stations in turn on the rail layer does.
 */
export class CreateLine implements Command {
  readonly type = "CreateLine";
  private created?: LineId;

  constructor(readonly stops: readonly NodeId[]) {}

  validate(state: Readonly<GameState>): Result {
    const stops = checkStops(state, this.stops);
    if (!stops.ok) return stops;
    // Its first train needs a free platform somewhere on it.
    if (this.stops.every((id) => state.reservations.has(platformKey(id)))) {
      return fail("occupied");
    }
    return canAfford(state, trainCost(MVP_WAGONS)) ? ok() : fail("no_stock");
  }

  apply(state: GameState, emit: Emit) {
    const id = allocateId(state.nextIds, "line");
    state.lines.set(id, { id, stops: this.lineStops() });
    this.created = id;
    new PlaceTrain(id).apply(state, emit);
    emit({ type: "LineCreated", line: id });
  }

  invert(): Command {
    if (this.created === undefined)
      throw new Error("CreateLine was not applied");
    return new RemoveLine(this.created);
  }

  private lineStops() {
    return this.stops.map((station) => ({
      station,
      condition: { ...DEFAULT_DEPARTURE },
    }));
  }
}
