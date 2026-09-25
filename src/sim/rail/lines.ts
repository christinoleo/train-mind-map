// Lines (FR95–FR97): a train follows its Line's stops, round and round. At
// each stop it loads or unloads at the Station (FR92, FR93), each wagon
// holding one type of item (FR89), until the stop's departure condition
// holds (FR96).

import { TICK_MS } from "../../config/constants";
import {
  FULL_IDLE_SECONDS,
  TRAIN_MOTION,
  WAGON_CAPACITY,
  WAGON_TRANSFER_PER_S,
  type DepartureCondition,
} from "../../data/rail";
import type {
  GameState,
  Line,
  StationNode,
  Train,
  Wagon,
} from "../state/gameState";
import type { LineId, NodeId } from "../state/ids";
import { secondsToTicks } from "../state/production";
import { store, storedCount, withdraw } from "../state/stock";
import { findRoute } from "./segments";
import { stationCapacity, trainCapacity } from "./station";

const TICKS_PER_S = 1000 / TICK_MS;

/** Items one wagon moves in a tick at a stop. */
const TRANSFER_PER_TICK = (WAGON_TRANSFER_PER_S * TICK_MS) / 1000;

/** The trains that follow Line `line`. */
export function lineTrains(state: Readonly<GameState>, line: LineId): Train[] {
  return [...state.trains.values()].filter((t) => t.line === line);
}

/**
 * True when one more train on Lines over `stations` would leave no Station
 * of their shared network free. That network is `stations` and every stop
 * of a Line that stops at one, and so on through the Lines those reach. A
 * Station has one platform, so its trains need one Station more than they
 * are: trains standing in each other's next stops would wait for good.
 */
export function networkFull(
  state: Readonly<GameState>,
  stations: readonly NodeId[],
): boolean {
  const reached = new Set(stations);
  const joined = new Set<LineId>();
  for (let grew = true; grew;) {
    grew = false;
    for (const line of state.lines.values()) {
      if (joined.has(line.id)) continue;
      if (!line.stops.some((s) => reached.has(s.station))) continue;
      joined.add(line.id);
      for (const s of line.stops) reached.add(s.station);
      grew = true;
    }
  }
  let trains = 0;
  for (const train of state.trains.values()) {
    if (joined.has(train.line)) trains++;
  }
  return trains >= reached.size - 1;
}

/** The Line `train` follows. */
export function lineOf(state: Readonly<GameState>, train: Readonly<Train>) {
  const line = state.lines.get(train.line);
  if (!line) throw new Error(`train ${train.id} has no line ${train.line}`);
  return line;
}

/**
 * What a train does at `station` (FR92): it unloads where edges leave the
 * Station, and loads where edges only enter it. A Station with both is a
 * drop-off, since loading would take back what the train just unloaded.
 * With no edges it does neither.
 */
export function stationRole(
  state: Readonly<GameState>,
  station: NodeId,
): "load" | "unload" | null {
  let feeds = false;
  for (const edge of state.edges.values()) {
    if (edge.from === station) return "unload";
    if (edge.to === station) feeds = true;
  }
  return feeds ? "load" : null;
}

/** Loads `wagons` from `station`'s buffer, and returns the items moved. */
function load(station: StationNode, wagons: Wagon[]): number {
  let moved = 0;
  for (const wagon of wagons) {
    const room = Math.min(TRANSFER_PER_TICK, WAGON_CAPACITY - wagon.count);
    if (room <= 0) continue;
    // An empty wagon takes the type of the item that has waited longest.
    const item = wagon.item ?? station.items[0]?.item;
    if (item === undefined) break;
    const took = withdraw(station, item, room);
    if (took === 0) continue;
    wagon.item = item;
    wagon.count += took;
    moved += took;
  }
  return moved;
}

/** Unloads `wagons` into `station`'s buffer, and returns the items moved. */
function unload(station: StationNode, wagons: Wagon[]): number {
  let moved = 0;
  for (const wagon of wagons) {
    if (wagon.item === null) continue;
    const room = stationCapacity() - storedCount(station);
    const put = Math.min(TRANSFER_PER_TICK, wagon.count, room);
    if (put <= 0) break;
    store(station, wagon.item, put);
    wagon.count -= put;
    moved += put;
    // An emptied wagon is free to take any item again.
    if (wagon.count === 0) wagon.item = null;
  }
  return moved;
}

/**
 * Loads or unloads `train` at `station` for one tick, as `role` says, at the
 * wagons' rate (FR93), and returns the items moved.
 */
export function transfer(
  state: GameState,
  train: Train,
  station: NodeId,
  role: ReturnType<typeof stationRole>,
): number {
  const node = state.nodes.get(station);
  if (node?.kind !== "station") return 0;
  if (role === "load") return load(node, train.wagons);
  if (role === "unload") return unload(node, train.wagons);
  return 0;
}

/** True when every wagon is full. */
function isFull(wagons: readonly Wagon[]): boolean {
  return wagons.every((w) => w.count >= WAGON_CAPACITY);
}

/** True when every wagon is empty. */
function isEmpty(wagons: readonly Wagon[]): boolean {
  return wagons.every((w) => w.count === 0);
}

/**
 * True when `train` may leave the stop it stands at under `condition`
 * (FR96). The times count whole ticks at the stop. "cheio" also gives up
 * after `FULL_IDLE_SECONDS` with nothing moved, so a stop that never fills
 * cannot hold a train for good.
 */
export function mayDepart(
  train: Pick<Train, "wagons" | "waited" | "idle">,
  condition: DepartureCondition,
): boolean {
  const ticks = secondsToTicks(condition.seconds);
  switch (condition.kind) {
    case "full":
      return (
        isFull(train.wagons) || train.idle >= secondsToTicks(FULL_IDLE_SECONDS)
      );
    case "empty":
      return isEmpty(train.wagons);
    case "wait":
      return train.waited >= ticks;
    case "full_or_wait":
      return isFull(train.wagons) || train.waited >= ticks;
    case "inactive":
      return train.idle >= ticks;
  }
}

/**
 * A Line's effective throughput (FR97), in items per second: the load per
 * trip over the round-trip time, times the trains.
 */
export function effectiveThroughput(
  perTrip: number,
  roundTripSeconds: number,
  trains: number,
): number {
  return roundTripSeconds > 0 ? (perTrip / roundTripSeconds) * trains : 0;
}

/**
 * Seconds a train takes over `cells` from a stop to a stop, speeding up
 * and braking at the rates of FR90.
 */
export function travelSeconds(cells: number): number {
  const { maxSpeed: v, accelSeconds, brake } = TRAIN_MOTION;
  const accel = v / accelSeconds;
  const ramps = (v * v) / (2 * accel) + (v * v) / (2 * brake);
  if (cells >= ramps) return v / accel + v / brake + (cells - ramps) / v;
  const peak = Math.sqrt((2 * cells * accel * brake) / (accel + brake));
  return peak / accel + peak / brake;
}

/**
 * The shortest a train can stand at a stop under `condition`: filling or
 * emptying its wagons at the transfer rate, then any time it waits.
 */
function stopSeconds(condition: DepartureCondition): number {
  const fill = WAGON_CAPACITY / WAGON_TRANSFER_PER_S;
  switch (condition.kind) {
    case "wait":
      return condition.seconds;
    case "full_or_wait":
      return Math.min(fill, condition.seconds);
    case "inactive":
      return fill + condition.seconds;
    default:
      return fill;
  }
}

/**
 * A round trip's time from the Line's layout alone, in seconds: the travel
 * between its stops and the shortest stand at each. `null` when a stop has
 * no route to the next.
 */
export function estimateRoundTrip(
  state: Readonly<GameState>,
  line: Readonly<Line>,
): number | null {
  let seconds = 0;
  for (let i = 0; i < line.stops.length; i++) {
    const from = line.stops[i];
    const to = line.stops[(i + 1) % line.stops.length];
    const route = findRoute(state, from.station, to.station);
    if (!route) return null;
    const cells = route.reduce((sum, s) => sum + s.length, 0);
    seconds += stopSeconds(from.condition) + travelSeconds(cells);
  }
  return seconds;
}

/** What the Line panel shows of a Line's throughput (FR97). */
export interface LineThroughput {
  /** Items one train carries per trip. */
  perTrip: number;
  /** Seconds a round trip takes, or `null` when no route closes it. */
  roundTrip: number | null;
  /** True when `roundTrip` is the trains' last measured laps' average. */
  measured: boolean;
  trains: number;
  /** Items per second the Line carries. */
  perSecond: number;
}

/**
 * `line`'s effective throughput (FR97): the round trip is the average of
 * its trains' last laps once any has made one, and the layout's estimate
 * before.
 */
export function lineThroughput(
  state: Readonly<GameState>,
  line: Readonly<Line>,
): LineThroughput {
  const trains = lineTrains(state, line.id);
  const laps = trains.flatMap((t) => (t.lap === null ? [] : [t.lap]));
  const measured = laps.length > 0;
  const roundTrip = measured
    ? laps.reduce((a, b) => a + b, 0) / laps.length / TICKS_PER_S
    : estimateRoundTrip(state, line);
  const perTrip =
    trains.length > 0 ? trainCapacity(trains[0].wagons.length) : 0;
  return {
    perTrip,
    roundTrip,
    measured,
    trains: trains.length,
    perSecond:
      roundTrip === null
        ? 0
        : effectiveThroughput(perTrip, roundTrip, trains.length),
  };
}
