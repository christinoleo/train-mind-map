import { FLOW_UNITS_PER_CELL, TICK_MS } from "../../config/constants";
import { ITEM_SPEED } from "../../data/edges";
import type { ItemId } from "../../data/items";
import { edgeUnits, spacingUnits } from "../state/edges";
import type { Edge } from "../state/gameState";
import { acceptItem, takeOutput } from "../state/production";
import type { System } from "../tick";

/** Flow units an item moves along an edge each tick. */
export const STEP_UNITS = (ITEM_SPEED * FLOW_UNITS_PER_CELL * TICK_MS) / 1000;

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
    // Items never move back: one closer than the spacing waits.
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
