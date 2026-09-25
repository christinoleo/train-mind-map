import { NODES } from "../../data/nodes";
import {
  MVP_WAGONS,
  RAIL_SIDES,
  STATION,
  WAGON_CAPACITY,
  type RailSide,
} from "../../data/rail";
import type { Point } from "../geometry/planar";
import { spreadRows } from "../state/edges";
import type { StationNode } from "../state/gameState";

/**
 * A circle on a Station's side where exactly one rail attaches. A train
 * stops at the Station itself: it arrives through one rail port and may
 * leave through any of them.
 */
export interface RailPort {
  side: RailSide;
  /** Which of the side's rail ports, counted from the top. */
  index: number;
  /** The cell just outside the side, where the rail's route starts or ends. */
  cell: Point;
}

/** Items a train with `wagons` wagons carries at most. */
export function trainCapacity(wagons: number): number {
  return wagons * WAGON_CAPACITY;
}

/**
 * Items a Station's buffer holds (FR92): twice the load of the largest
 * train that stops there. Every MVP train has the same wagons.
 */
export function stationCapacity(): number {
  return STATION.bufferTrains * trainCapacity(MVP_WAGONS);
}

/**
 * Every rail port of `station`, left side first, each side from the top.
 * They spread evenly over the whole side, one row each, so the MVP's single
 * port sits on the card's middle row.
 */
export function railPorts(
  station: Pick<StationNode, "kind" | "x" | "y">,
): RailPort[] {
  const { size } = NODES[station.kind];
  return RAIL_SIDES.flatMap((side) =>
    spreadRows(STATION.railPorts[side], size).map((row, index) => ({
      side,
      index,
      cell: {
        x: side === "left" ? station.x - 1 : station.x + size,
        y: station.y + row,
      },
    })),
  );
}
