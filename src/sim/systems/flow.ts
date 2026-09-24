import { FLOW_UNITS_PER_CELL, TICK_MS } from "../../config/constants";
import { ITEM_SPEED } from "../../data/edges";
import type { ItemId } from "../../data/items";
import { NODES } from "../../data/nodes";
import { edgeUnits, spacingUnits } from "../state/edges";
import type { Edge, FactoryNode, GameState } from "../state/gameState";
import type { NodeId } from "../state/ids";
import { acceptItem, takeOutput } from "../state/production";
import {
  bufferCapacity,
  isBuffer,
  store,
  storedCount,
  takeOldest,
} from "../state/stock";
import type { Emit } from "../events";
import type { System } from "../tick";

/** Flow units an item moves along an edge each tick. */
export const STEP_UNITS = (ITEM_SPEED * FLOW_UNITS_PER_CELL * TICK_MS) / 1000;

/**
 * Moves an edge's items one tick. Each item moves `STEP_UNITS` but keeps its
 * spacing to the one ahead. The front item leaves through `deliver` on the
 * tick it reaches the input connector; while that refuses it, it waits there
 * and the queue halts behind it (FR57). Once the last item has left room, a
 * new one enters from `take`, of any type (FR56); it keeps what the last one
 * moved past the spacing, so the edge carries exactly its throughput. A last
 * item delivered this tick still counts, where it would have moved to, so a
 * short edge cannot skip the spacing.
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
  let delivered: number | undefined;
  while (items.length > 0 && items[0].pos + STEP_UNITS >= end) {
    if (!deliver(items[0].item)) break;
    delivered = items.shift()!.pos + STEP_UNITS;
  }
  let limit = end;
  for (const it of items) {
    // Items never move back: one closer than the spacing waits.
    it.pos = Math.min(it.pos + STEP_UNITS, Math.max(limit, it.pos));
    limit = it.pos - spacing;
  }
  const back = items.length > 0 ? items[items.length - 1].pos : delivered;
  if (back !== undefined && back < spacing) return;
  const item = take();
  if (item === undefined) return;
  const pos = back === undefined ? 0 : back - spacing;
  items.push({ item, pos, prevPos: pos });
}

/** A Splitter or a Merger: a node that passes items on the tick they arrive. */
type RouterNode = Extract<FactoryNode, { kind: "splitter" | "merger" }>;

/** Every node's edges, by the connector they attach to. */
interface Links {
  inputs: Map<NodeId, Edge[]>;
  outputs: Map<NodeId, Edge[]>;
}

function linksOf(state: GameState): Links {
  const links: Links = { inputs: new Map(), outputs: new Map() };
  const add = (map: Map<NodeId, Edge[]>, id: NodeId, port: number, e: Edge) => {
    let ports = map.get(id);
    if (!ports) map.set(id, (ports = []));
    ports[port] = e;
  };
  for (const edge of state.edges.values()) {
    add(links.outputs, edge.from, edge.fromPort, edge);
    add(links.inputs, edge.to, edge.toPort, edge);
  }
  return links;
}

/** The item waiting at the end of `edge` for its node to take it, if any. */
function waiting(edge: Edge | undefined): ItemId | undefined {
  const front = edge?.items[0];
  return front && front.pos >= edgeUnits(edge) ? front.item : undefined;
}

/** True when `edge` exists and has room at its output connector for an item. */
function isOpen(edge: Edge | undefined): boolean {
  if (!edge) return false;
  const back = edge.items.at(-1);
  return !back || back.pos >= spacingUnits(edge.level);
}

/**
 * The first of `node`'s `count` connectors that passes `pick`, going round
 * from the one whose turn is next.
 */
function nextInTurn(
  node: RouterNode,
  count: number,
  pick: (turn: number) => boolean,
): number | undefined {
  for (let i = 0; i < count; i++) {
    const turn = (node.next + i) % count;
    if (pick(turn)) return turn;
  }
  return undefined;
}

/**
 * Hands the output edge on `port` of a Splitter the item waiting at its
 * input, when that output's turn has come (FR37). The turn goes round the
 * outputs and skips each one that could take no item now, so a blocked or
 * missing output never holds the others up.
 */
function split(node: RouterNode, port: number, links: Links) {
  const input = links.inputs.get(node.id)?.[0];
  const item = waiting(input);
  if (item === undefined) return undefined;
  const outputs = links.outputs.get(node.id);
  const count = NODES[node.kind].outputs;
  const turn = nextInTurn(
    node,
    count,
    (t) => t === port || isOpen(outputs?.[t]),
  );
  if (turn !== port) return undefined;
  input!.items.shift();
  node.next = (port + 1) % count;
  return item;
}

/**
 * Hands a Merger's output edge the item waiting at its next input in turn
 * that has one, so every busy input gets an equal share (FR38).
 */
function merge(node: RouterNode, links: Links) {
  const inputs = links.inputs.get(node.id);
  const count = NODES[node.kind].inputs;
  const turn = nextInTurn(
    node,
    count,
    (t) => waiting(inputs?.[t]) !== undefined,
  );
  if (turn === undefined) return undefined;
  node.next = (turn + 1) % count;
  return inputs![turn].items.shift()!.item;
}

/** Takes the next item for the edge leaving `node` from output `port`. */
function take(node: FactoryNode, port: number, links: Links) {
  if (node.kind === "splitter") return split(node, port, links);
  if (node.kind === "merger") return merge(node, links);
  if (isBuffer(node)) return takeOldest(node);
  return takeOutput(node);
}

/** Hands `item` to `node`; returns whether it entered. */
function deliver(state: GameState, node: FactoryNode, item: ItemId): boolean {
  if (!isBuffer(node)) return acceptItem(node, item);
  if (storedCount(node) >= bufferCapacity(state, node)) return false;
  store(node, item, 1);
  return true;
}

/**
 * True when a Splitter or Merger has an item waiting that none of its
 * outputs can take: every output is blocked (FR37).
 */
function isBlocked(node: RouterNode, links: Links): boolean {
  const inputs = links.inputs.get(node.id) ?? [];
  if (!inputs.some((edge) => waiting(edge) !== undefined)) return false;
  return !(links.outputs.get(node.id) ?? []).some(isOpen);
}

/** Reports a Splitter or Merger that became blocked, or ran again. */
function updateRouter(node: RouterNode, links: Links, emit: Emit) {
  const blocked = isBlocked(node, links);
  if (blocked === node.blocked) return;
  node.blocked = blocked;
  emit({
    type: "NodeStatusChanged",
    node: node.id,
    status: blocked ? "blocked" : "working",
  });
}

/**
 * Items move along every edge (FR55–FR57): out of the source node and into
 * the target node. Producers fill their input buffers and empty their output
 * buffers; the Core and Boxes store what arrives while they have room and
 * send out the oldest (FR28, FR29), and so do Stations, into their buffer
 * (FR92); Splitters and Mergers pass items straight through. A full node
 * refuses, and the edges behind it back up (FR73).
 */
export const flow: System = (state, { emit }) => {
  const links = linksOf(state);
  for (const edge of state.edges.values()) {
    const from = state.nodes.get(edge.from);
    const to = state.nodes.get(edge.to);
    if (!from || !to) continue;
    stepEdge(
      edge,
      () => take(from, edge.fromPort, links),
      (item) => deliver(state, to, item),
    );
  }
  for (const node of state.nodes.values()) {
    if (node.kind === "splitter" || node.kind === "merger") {
      updateRouter(node, links, emit);
    }
  }
};
