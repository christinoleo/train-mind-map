// Trains (FR88, FR90, FR94): a locomotive and its wagons, moving by
// reservation (FR86). A train at a stop loads or unloads until its Line's
// departure condition holds, then waits at the end of its Segment, in the
// Station, until it can reserve its whole trip to the next stop. It leaves,
// and brakes from its braking point to stop at the platform.

import { TICK_MS } from "../../config/constants";
import type { Cost } from "../../data/nodes";
import {
  LOCOMOTIVE_COST,
  TRAIN_MOTION,
  VEHICLE_CELLS,
  WAGON_COST,
} from "../../data/rail";
import type { Emit } from "../events";
import type { GameState, Train, TrainState, Trip } from "../state/gameState";
import type { LineId, NodeId, RailId, TrainId } from "../state/ids";
import { lineOf, mayDepart, stationRole, transfer } from "./lines";
import { canReserveTrip, hold, releaseWhere, reserveTrip } from "./reservation";
import { buildTrip, findRoute, platformKey } from "./segments";

const DT = TICK_MS / 1000;
const ACCEL = TRAIN_MOTION.maxSpeed / TRAIN_MOTION.accelSeconds;

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
  return (1 + train.wagons.length) * VEHICLE_CELLS;
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
 * A new train with `wagons` empty wagons, standing at stop `stop` of
 * `line`, holding its platform. Only commands call it.
 */
export function createTrain(
  state: GameState,
  id: TrainId,
  line: LineId,
  stop: number,
  wagons: number,
): Train {
  const station = state.lines.get(line)!.stops[stop].station;
  const train: Train = {
    id,
    line,
    wagons: Array.from({ length: wagons }, () => ({ item: null, count: 0 })),
    stop,
    state: "loading",
    station,
    trip: null,
    pos: 0,
    prevPos: 0,
    speed: 0,
    waited: 0,
    idle: 0,
    blocked: 0,
    lapStart: null,
    lap: null,
    holds: [],
  };
  hold(state, train, { key: platformKey(station), release: null });
  state.trains.set(id, train);
  return train;
}

function setState(train: Train, next: TrainState, emit: Emit): void {
  // `blocked` counts an unbroken run of waiting for a reservation.
  if (next !== "waiting_reservation") train.blocked = 0;
  if (train.state === next) return;
  train.state = next;
  emit({ type: "TrainStateChanged", train: train.id, state: next });
}

/** Advances `train` by one tick. */
export function stepTrain(state: GameState, train: Train, emit: Emit): void {
  train.prevPos = train.pos;
  if (train.station === null) travel(state, train, emit);
  else atStop(state, train, train.station, emit);
}

/**
 * Loads or unloads at `station` for a tick, then leaves if the stop's
 * departure condition holds (FR96).
 */
function atStop(
  state: GameState,
  train: Train,
  station: NodeId,
  emit: Emit,
): void {
  const role = stationRole(state, station);
  const moved = transfer(state, train, station, role);
  train.waited++;
  train.idle = moved > 0 ? 0 : train.idle + 1;
  const { condition } = lineOf(state, train).stops[train.stop];
  if (mayDepart(train, condition)) {
    depart(state, train, station, emit);
  } else {
    setState(train, role === "unload" ? "unloading" : "loading", emit);
  }
}

/** The index in its Line of the stop `train` heads for next. */
function nextStop(state: Readonly<GameState>, train: Readonly<Train>): number {
  return (train.stop + 1) % lineOf(state, train).stops.length;
}

/**
 * The trip `train`, standing at `station`, would take to its next stop:
 * around Stations other trains stand in, when there is a way, since head on
 * into them the two trains would wait for each other for good. `null` while
 * no route leads there.
 */
export function nextTrip(
  state: Readonly<GameState>,
  train: Readonly<Train>,
  station: NodeId,
): Trip | null {
  const target = lineOf(state, train).stops[nextStop(state, train)].station;
  const taken = (id: NodeId) => {
    const holder = state.reservations.get(platformKey(id));
    return holder !== undefined && holder !== train.id;
  };
  const route =
    findRoute(state, station, target, taken) ??
    findRoute(state, station, target);
  return route && buildTrip(state, route);
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
  const trip = nextTrip(state, train, station);
  if (!trip || !canReserveTrip(state, train.id, trip)) {
    train.blocked++;
    setState(train, "waiting_reservation", emit);
    return;
  }
  // The platform it stands on frees once its tail is out of the Station.
  for (const h of train.holds) h.release = trip.exit;
  reserveTrip(state, train, trip);
  // Leaving the first stop ends one round trip and starts the next.
  if (train.stop === 0) {
    if (train.lapStart !== null) train.lap = state.tick - train.lapStart;
    train.lapStart = state.tick;
  }
  train.trip = trip;
  train.stop = nextStop(state, train);
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
  const station = lineOf(state, train).stops[train.stop].station;
  const platform = platformKey(station);
  releaseWhere(state, train, (h) => h.key !== platform);
  train.speed = 0;
  train.station = station;
  train.waited = 0;
  train.idle = 0;
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

/** True when a Line stops at `station`, so its trains may stand in it. */
export function isStationInUse(
  state: Readonly<GameState>,
  station: NodeId,
): boolean {
  for (const line of state.lines.values()) {
    if (line.stops.some((stop) => stop.station === station)) return true;
  }
  return false;
}
