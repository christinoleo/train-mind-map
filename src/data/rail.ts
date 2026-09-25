import type { Cost } from "./nodes";

/** Items one wagon carries, all of one type (GDD §Trens). */
export const WAGON_CAPACITY = 50;

/** Wagons behind the locomotive of every MVP train (GDD §Trens). */
export const MVP_WAGONS = 2;

/** A side of a Station card where rail ports sit. */
export type RailSide = "left" | "right";

export const RAIL_SIDES: readonly RailSide[] = ["left", "right"];

/**
 * The Station (FR41, FR92). Its buffer holds `bufferTrains` times the load
 * of the largest train that stops there. It has `railPorts[side]` rail ports
 * on each side: one each in the MVP, up to 2–3 after a later upgrade.
 */
export const STATION = {
  bufferTrains: 2,
  railPorts: { left: 1, right: 1 },
} as const satisfies {
  bufferTrains: number;
  railPorts: Readonly<Record<RailSide, number>>;
};

/** Rail items one cell of rail costs (FR45). */
export const RAIL_CELL_COST = 1;

/** What a locomotive costs to build (GDD §Trens). */
export const LOCOMOTIVE_COST = {
  "iron-plate": 20,
  gear: 20,
  circuit: 10,
} as const satisfies Cost;

/** What one wagon costs to build (GDD §Trens). */
export const WAGON_COST = {
  "iron-plate": 20,
  gear: 10,
} as const satisfies Cost;

/** Cells each vehicle, the locomotive or a wagon, takes on the track (FR91). */
export const VEHICLE_CELLS = 1;

/**
 * How trains move (FR90): up to `maxSpeed` cells/s, from 0 to top speed in
 * `accelSeconds`, braking at `brake` cells/s². Braking sets where a train
 * must start to slow before a stretch it could not reserve.
 */
export const TRAIN_MOTION = {
  maxSpeed: 8,
  accelSeconds: 3,
  brake: 8,
} as const;

/**
 * Seconds trains wait on each other's reservations in a cycle before the
 * lowest train id gives up its platform so the others can go (FR87).
 */
export const DEADLOCK_SECONDS = 10;

/**
 * Seconds with nothing loaded or unloaded after which a "cheio" stop lets
 * its train go anyway, so an unload-only stop cannot hold it for good.
 */
export const FULL_IDLE_SECONDS = 60;

/** Items each wagon loads or unloads per second at a stop (FR93, placeholder). */
export const WAGON_TRANSFER_PER_S = 50;

/**
 * When a train leaves a stop (FR96): full, empty, after `seconds` at the
 * stop, full or after `seconds`, or once nothing loaded or unloaded for
 * `seconds`. Kinds without a time ignore `seconds`.
 */
export const DEPARTURE_KINDS = [
  "full",
  "empty",
  "wait",
  "full_or_wait",
  "inactive",
] as const;

export type DepartureKind = (typeof DEPARTURE_KINDS)[number];

/** The departure kinds that wait a time. */
export const TIMED_DEPARTURES: readonly DepartureKind[] = [
  "wait",
  "full_or_wait",
  "inactive",
];

export interface DepartureCondition {
  kind: DepartureKind;
  seconds: number;
}

/**
 * The condition a new Line's stops start with: it suits a loading stop and
 * an unloading stop alike, since either ends once nothing moves.
 */
export const DEFAULT_DEPARTURE: DepartureCondition = {
  kind: "inactive",
  seconds: 5,
};

/** The times the Line panel offers for a timed condition, in seconds. */
export const DEPARTURE_SECONDS = [5, 10, 30, 60] as const;
