// Trains (FR88, FR90, FR94): a locomotive and its wagons, moving by
// reservation (FR86). A train at a stop dwells, then waits at the end of its
// Segment, in the Station, until it can reserve its whole trip to the next
// stop. It leaves, and brakes from its braking point to stop at the platform.

import { TICK_MS } from "../../config/constants";
import type { Cost } from "../../data/nodes";
import {
  LOCOMOTIVE_COST,
  TRAIN_DWELL_MS,
  TRAIN_MOTION,
  VEHICLE_CELLS,
  WAGON_COST,
} from "../../data/rail";
import type { Emit } from "../events";
import type { GameState, Train, TrainState } from "../state/gameState";
import type { NodeId, RailId, TrainId } from "../state/ids";
import { canReserveTrip, hold, releaseWhere, reserveTrip } from "./reservation";
import { buildTrip, findRoute, platformKey } from "./segments";

const DT = TICK_MS / 1000;
const ACCEL = TRAIN_MOTION.maxSpeed / TRAIN_MOTION.accelSeconds;
const DWELL_TICKS = Math.round(TRAIN_DWELL_MS / TICK_MS);

/** What a train with `wagons` wagons costs to build. */
export function trainCost(wagons: number): Cost {
  const cost: Record<string, number> = { ...LOCOMOTIVE_COST };
  for (const [item, count] of Object.entries(WAGON_COST)) {
    cost[item] = (cost[item] ?? 0) + count * wagons;
  }
  return cost;
}

/** A train's length in cells: the locomotive and its wagons (FR91). */
export function trainLength(train: Pick<Train, "wagons">): number {
  return (1 + train.wagons) * VEHICLE_CELLS;
}

/**
 * The fastest a train may run this tick and still stop within `room` cells:
 * one tick at that speed, then braking, covers no more than `room`.
 */
function stoppingSpeed(room: number): number {
  const b = TRAIN_MOTION.brake;
  const v = -b * DT + Math.sqrt(b * DT * (b * DT) + 2 * b * Math.max(0, room));
  return Math.max(0, v);
}

/**
 * A new train standing at the first of `stops`, holding its platform. Only
 * commands call it.
 */
export function createTrain(
  state: GameState,
  id: TrainId,
  stops: readonly NodeId[],
  wagons: number,
): Train {
  const train: Train = {
    id,
    wagons,
    stops: [...stops],
    stop: 0,
    state: "loading",
    station: stops[0],
    trip: null,
    pos: 0,
    prevPos: 0,
    speed: 0,
    dwell: DWELL_TICKS,
    holds: [],
  };
  hold(state, train, { key: platformKey(stops[0]), release: null });
  state.trains.set(id, train);
  return train;
}

function setState(train: Train, next: TrainState, emit: Emit): void {
  if (train.state === next) return;
  train.state = next;
  emit({ type: "TrainStateChanged", train: train.id, state: next });
}

/** Advances `train` by one tick. */
export function stepTrain(state: GameState, train: Train, emit: Emit): void {
  train.prevPos = train.pos;
  if (train.station === null) travel(state, train, emit);
  else if (train.dwell > 0) train.dwell--;
  else depart(state, train, train.station, emit);
}

/**
 * Leaves `station` for the next stop once its whole trip is reserved; it
 * waits otherwise, as it does while no route leads there.
 */
function depart(
  state: GameState,
  train: Train,
  station: NodeId,
  emit: Emit,
): void {
  const next = (train.stop + 1) % train.stops.length;
  // Around Stations other trains stand in, when there is a way; head on
  // into them the two trains would wait for each other for good.
  const target = train.stops[next];
  const taken = (id: NodeId) => {
    const holder = state.reservations.get(platformKey(id));
    return holder !== undefined && holder !== train.id;
  };
  const route =
    findRoute(state, station, target, taken) ??
    findRoute(state, station, target);
  const trip = route && buildTrip(state, route);
  if (!trip || !canReserveTrip(state, train.id, trip)) {
    setState(train, "waiting_reservation", emit);
    return;
  }
  // The platform it stands on frees once its tail is out of the Station.
  for (const h of train.holds) h.release = trip.exit;
  reserveTrip(state, train, trip);
  train.trip = trip;
  train.stop = next;
  train.station = null;
  train.pos = 0;
  train.prevPos = 0;
  train.speed = 0;
  setState(train, "departing", emit);
}

function travel(state: GameState, train: Train, emit: Emit): void {
  const trip = train.trip!;
  const stop = trip.legs[trip.legs.length - 1].stop;
  train.speed = Math.min(
    train.speed + ACCEL * DT,
    TRAIN_MOTION.maxSpeed,
    stoppingSpeed(stop - train.pos),
  );
  train.pos = Math.min(train.pos + train.speed * DT, stop);
  const tail = train.pos - trainLength(train);
  releaseWhere(state, train, (h) => h.release !== null && h.release <= tail);
  if (train.pos < stop) {
    setState(train, tail < trip.exit ? "departing" : "moving", emit);
  } else {
    arrive(state, train, emit);
  }
}

/**
 * Stops the train at its stop: it keeps the platform and lets go of the
 * rest, since no train enters a Segment without the platform it leads to.
 */
function arrive(state: GameState, train: Train, emit: Emit): void {
  const station = train.stops[train.stop];
  const platform = platformKey(station);
  releaseWhere(state, train, (h) => h.key !== platform);
  train.speed = 0;
  train.station = station;
  train.dwell = DWELL_TICKS;
  setState(train, "loading", emit);
  emit({ type: "TrainArrived", train: train.id, station });
}

/**
 * True when a train's trip under way crosses `rail`, which covers every
 * track it holds. Such a rail stays until the train is gone.
 */
export function isRailInUse(state: Readonly<GameState>, rail: RailId): boolean {
  for (const train of state.trains.values()) {
    if (train.station !== null) continue;
    if (train.trip?.legs.some((leg) => leg.rail === rail)) return true;
  }
  return false;
}

/** True when a train stops at `station`, or stands in it. */
export function isStationInUse(
  state: Readonly<GameState>,
  station: NodeId,
): boolean {
  for (const train of state.trains.values()) {
    if (train.stops.includes(station)) return true;
  }
  return false;
}
