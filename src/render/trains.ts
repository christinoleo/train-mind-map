import { Container, Graphics } from "pixi.js";
import { VEHICLE_CELLS } from "../data/rail";
import type { Point } from "../sim/geometry/planar";
import { pointAlong, platformPoint } from "../sim/rail/segments";
import { railPorts } from "../sim/rail/station";
import type { FactoryNode, Train } from "../sim/state/gameState";
import type { NodeId, TrainId } from "../sim/state/ids";
import type { DeepReadonly } from "./readonly";
import { TRACK_SIDE } from "./rails";
import { CATEGORY_COLOR, CELL_PX } from "./theme";

type TrainView = DeepReadonly<Train>;
type NodeView = DeepReadonly<FactoryNode>;

/** A vehicle's body, in cells: a little shorter than its cell, and narrow. */
const BODY_LENGTH = VEHICLE_CELLS * 0.86;
const BODY_WIDTH = 0.34;
const LOCOMOTIVE_COLOR = CATEGORY_COLOR.rail;
const WAGON_COLOR = 0x9aa3b5;
const OUTLINE_COLOR = 0x15181f;

/** Draws one vehicle centred on the origin, pointing along +x. */
function drawVehicle(g: Graphics, locomotive: boolean): Graphics {
  const l = BODY_LENGTH * CELL_PX;
  const w = BODY_WIDTH * CELL_PX;
  g.roundRect(-l / 2, -w / 2, l, w, w * 0.3)
    .fill(locomotive ? LOCOMOTIVE_COLOR : WAGON_COLOR)
    .stroke({ color: OUTLINE_COLOR, width: 1 });
  if (locomotive) {
    // A cab mark at the front shows which way it runs.
    g.rect(l / 2 - w * 0.6, -w / 4, w * 0.35, w / 2).fill(OUTLINE_COLOR);
  }
  return g;
}

/**
 * The line a train runs along, and how far along it its front is: its trip,
 * or across its Station's platform before its first trip.
 */
function trackOf(
  train: TrainView,
  nodes: ReadonlyMap<NodeId, NodeView>,
  alpha: number,
): { line: readonly Point[]; front: number } | null {
  if (train.trip) {
    const front = train.prevPos + (train.pos - train.prevPos) * alpha;
    return { line: train.trip.line, front };
  }
  const node = nodes.get(train.stops[train.stop]);
  if (node?.kind !== "station") return null;
  const stop = platformPoint(node, railPorts(node)[0]);
  return { line: [{ x: stop.x - 1, y: stop.y }, stop], front: 1 };
}

/**
 * Keeps one sprite set per train in `layer`, the locomotive and its wagons,
 * placed each frame along the train's line, interpolated between ticks.
 */
export class TrainViews {
  private readonly views = new Map<
    TrainId,
    { wagons: number; vehicles: Container }
  >();

  constructor(private readonly layer: Container) {}

  update(
    trains: ReadonlyMap<TrainId, TrainView>,
    nodes: ReadonlyMap<NodeId, NodeView>,
    alpha: number,
  ) {
    for (const [id, view] of this.views) {
      if (trains.get(id)?.wagons !== view.wagons) {
        view.vehicles.destroy({ children: true });
        this.views.delete(id);
      }
    }
    for (const [id, train] of trains) {
      let view = this.views.get(id);
      if (!view) {
        const vehicles = new Container({ label: `train:${id}` });
        for (let i = 0; i <= train.wagons; i++) {
          vehicles.addChild(drawVehicle(new Graphics(), i === 0));
        }
        this.layer.addChild(vehicles);
        view = { wagons: train.wagons, vehicles };
        this.views.set(id, view);
      }
      const track = trackOf(train, nodes, alpha);
      view.vehicles.visible = track !== null;
      if (!track) continue;
      view.vehicles.children.forEach((vehicle, i) => {
        const s = track.front - VEHICLE_CELLS * (i + 0.5);
        const { x, y, angle } = pointAlong(track.line, s);
        // Right of the way it runs, so trains each way keep to their track.
        vehicle.position.set(
          (x - Math.sin(angle) * TRACK_SIDE) * CELL_PX,
          (y + Math.cos(angle) * TRACK_SIDE) * CELL_PX,
        );
        vehicle.rotation = angle;
      });
    }
  }

  /** Drops every sprite, so the next `update` draws them all again. */
  clear() {
    for (const { vehicles } of this.views.values()) {
      vehicles.destroy({ children: true });
    }
    this.views.clear();
  }
}
