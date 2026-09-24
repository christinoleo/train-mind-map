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
