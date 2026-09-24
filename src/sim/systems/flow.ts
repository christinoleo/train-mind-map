import { FLOW_UNITS_PER_CELL, TICK_MS } from "../../config/constants";
import { EDGE_THROUGHPUT, ITEM_SPEED, type EdgeLevel } from "../../data/edges";
import type { ItemId } from "../../data/items";
import { pathLength } from "../geometry/route";
import type { Edge } from "../state/gameState";
import { acceptItem, takeOutput } from "../state/production";
import type { System } from "../tick";

/** Flow units an item moves along an edge each tick. */
export const STEP_UNITS = (ITEM_SPEED * FLOW_UNITS_PER_CELL * TICK_MS) / 1000;

/**
 * Least flow units between two items on an edge at `level`: speed ÷
 * throughput, which caps the edge at its throughput (FR55).
 */
export function spacingUnits(level: EdgeLevel): number {
  return (ITEM_SPEED * FLOW_UNITS_PER_CELL) / EDGE_THROUGHPUT[level - 1];
}

/** An edge's length in flow units: from its output connector to its input. */
export function edgeUnits(edge: Pick<Edge, "path">): number {
  return pathLength(edge.path) * FLOW_UNITS_PER_CELL;
}

/**
 * True when an edge is full (FR57): its front item waits at a node that
 * refuses it, and the queue behind has backed up to the output connector.
 */
export function isEdgeFull(edge: Readonly<Edge>): boolean {
  const front = edge.items[0];
  const back = edge.items[edge.items.length - 1];
  return front?.pos === edgeUnits(edge) && back.pos < spacingUnits(edge.level);
}

/**
 * Moves an edge's items one tick. Each item moves `STEP_UNITS` but keeps its
 * spacing to the one ahead. The front item leaves through `deliver` on the
 * tick it reaches the input connector; while that refuses it, it waits there
 * and the queue halts behind it (FR57). Once
 * the last item has left room, a new one enters from `take`, of any type
 * (FR56); it keeps what the last one moved past the spacing, so the edge
 * carries exactly its throughput.
 */
export function stepEdge(
  edge: Edge,
  take: () => ItemId | undefined,
  deliver: (item: ItemId) => boolean,
): void {
  const { items } = edge;
  const end = edgeUnits(edge);
  const spacing = spacingUnits(edge.level);
  for (const it of items) it.prevPos = it.pos;
  while (items.length > 0 && items[0].pos + STEP_UNITS >= end) {
    if (!deliver(items[0].item)) break;
    items.shift();
  }
  let limit = end;
  for (const it of items) {
    // After a downgrade an item may sit closer than the spacing; it waits.
    it.pos = Math.min(it.pos + STEP_UNITS, Math.max(limit, it.pos));
    limit = it.pos - spacing;
  }
  const back = items[items.length - 1];
  if (back && back.pos < spacing) return;
  const item = take();
  if (item === undefined) return;
  const pos = back ? back.pos - spacing : 0;
  items.push({ item, pos, prevPos: pos });
}

/**
 * Items move along every edge (FR55–FR57): out of the source node's output
 * buffer and into the target node's input buffers.
 */
export const flow: System = (state) => {
  for (const edge of state.edges.values()) {
    const from = state.nodes.get(edge.from);
    const to = state.nodes.get(edge.to);
    if (!from || !to) continue;
    stepEdge(
      edge,
      () => takeOutput(from),
      (item) => acceptItem(to, item),
    );
  }
};
