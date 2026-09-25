// Residual deadlock (FR87): trains standing in their Stations, each waiting
// on a reservation another of them holds. The wait-for graph links a train
// that waits for its trip to the trains holding part of it. A cycle whose
// trains have all waited `DEADLOCK_SECONDS` is broken by its lowest train
// id, which gives up its platform and tries again, so the others can go.

import { DEADLOCK_SECONDS } from "../../data/rail";
import type { Emit } from "../events";
import type { GameState, Train } from "../state/gameState";
import type { TrainId } from "../state/ids";
import { secondsToTicks } from "../state/production";
import { releaseWhere } from "./reservation";
import { platformKey } from "./segments";
import { nextTrip } from "./trains";

/** The trains holding part of the trip `train` waits to reserve. */
function waitsOn(state: Readonly<GameState>, train: Readonly<Train>) {
  const holders = new Set<TrainId>();
  if (train.station === null) return holders;
  const trip = nextTrip(state, train, train.station);
  for (const leg of trip?.legs ?? []) {
    for (const key of [leg.segment, leg.platform]) {
      const holder = state.reservations.get(key);
      if (holder !== undefined && holder !== train.id) holders.add(holder);
    }
  }
  return holders;
}

/** A cycle of `graph` through `start`, from `start` on, if there is one. */
function cycleThrough(
  start: TrainId,
  graph: ReadonlyMap<TrainId, ReadonlySet<TrainId>>,
): TrainId[] | null {
  const parent = new Map<TrainId, TrainId>();
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const at = queue[i];
    for (const next of graph.get(at) ?? []) {
      if (next === start) {
        const cycle = [at];
        while (cycle[0] !== start) cycle.unshift(parent.get(cycle[0])!);
        return cycle;
      }
      if (parent.has(next) || !graph.has(next)) continue;
      parent.set(next, at);
      queue.push(next);
    }
  }
  return null;
}

/**
 * Breaks every cycle of trains that have waited `DEADLOCK_SECONDS` or more
 * on each other's reservations: its lowest train id lets go of its platform.
 */
export function breakDeadlocks(state: GameState, emit: Emit): void {
  const limit = secondsToTicks(DEADLOCK_SECONDS);
  const graph = new Map<TrainId, Set<TrainId>>();
  for (const train of state.trains.values()) {
    if (train.blocked >= limit) graph.set(train.id, waitsOn(state, train));
  }
  for (const id of [...graph.keys()].sort((a, b) => a - b)) {
    const cycle = cycleThrough(id, graph);
    if (!cycle) continue;
    const train = state.trains.get(id)!;
    const platform = platformKey(train.station!);
    releaseWhere(state, train, (h) => h.key === platform);
    train.blocked = 0;
    graph.delete(id);
    emit({ type: "TrainDeadlock", trains: cycle, released: id });
  }
}
