// The reservation table (FR86, ADR-0005): which train holds each Segment and
// platform. A train reserves its whole trip to its next stop before it
// leaves, so two trains never share a stretch of track, and a train never
// stops between stops, where two trains head on could wait for each other.
// A Station has one platform, though: trains standing in each other's next
// stops, such as [a, c] and [c, a], still wait for each other for good.

import type { GameState, Hold, Train, Trip } from "../state/gameState";
import type { TrainId } from "../state/ids";

/** The reservation table the trains' holds make up. */
export function reservationsOf(
  trains: ReadonlyMap<TrainId, Pick<Train, "id" | "holds">>,
): Map<string, TrainId> {
  const table = new Map<string, TrainId>();
  for (const train of trains.values()) {
    for (const { key } of train.holds) table.set(key, train.id);
  }
  return table;
}

/** True when every key is free, or already held by `train`. */
export function canHold(
  state: Readonly<GameState>,
  train: TrainId,
  keys: readonly string[],
): boolean {
  return keys.every((key) => {
    const holder = state.reservations.get(key);
    return holder === undefined || holder === train;
  });
}

/** Every Segment and platform `trip` runs through. */
export function tripKeys(trip: Trip): string[] {
  return trip.legs.flatMap((leg) => [leg.segment, leg.platform]);
}

/** True when `train` may reserve all of `trip`: every Segment and platform. */
export function canReserveTrip(
  state: Readonly<GameState>,
  train: TrainId,
  trip: Trip,
): boolean {
  return canHold(state, train, tripKeys(trip));
}

/** Records that `train` holds `next`. */
export function hold(state: GameState, train: Train, next: Hold): void {
  const own = train.holds.find((h) => h.key === next.key);
  if (own) own.release = next.release;
  else train.holds.push(next);
  state.reservations.set(next.key, train.id);
}

/**
 * Reserves all of `trip` for `train`: each Segment until its tail leaves
 * it, each platform on the way until its tail leaves the Station, and the
 * last stop's platform for good.
 */
export function reserveTrip(state: GameState, train: Train, trip: Trip): void {
  trip.legs.forEach((leg, i) => {
    const last = i === trip.legs.length - 1;
    hold(state, train, { key: leg.segment, release: leg.enter });
    hold(state, train, { key: leg.platform, release: last ? null : leg.exit });
  });
}

/** Lets go of whatever `train` holds that `drop` picks. */
export function releaseWhere(
  state: GameState,
  train: Train,
  drop: (hold: Hold) => boolean,
): void {
  train.holds = train.holds.filter((h) => {
    if (!drop(h)) return true;
    if (state.reservations.get(h.key) === train.id) {
      state.reservations.delete(h.key);
    }
    return false;
  });
}
