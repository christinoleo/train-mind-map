import { FLOW_UNITS_PER_CELL, TICK_MS } from "../../config/constants";
import { ITEM_SPEED } from "../../data/edges";
import type { ItemCounts, ItemId } from "../../data/items";
import { NODES } from "../../data/nodes";
import { edgeUnits, spacingUnits } from "../state/edges";
import type { Edge, FactoryNode, GameState } from "../state/gameState";
import type { NodeId } from "../state/ids";
import {
  acceptItem,
  heldInput,
  inputLimit,
  inputNeeds,
  inputTakes,
  takeOutput,
} from "../state/production";
import { bufferRoom, isBuffer, store, takeOldest } from "../state/stock";
import type { Emit } from "../events";
import type { System } from "../tick";

/** Flow units an item moves along an edge each tick. */
export const STEP_UNITS = (ITEM_SPEED * FLOW_UNITS_PER_CELL * TICK_MS) / 1000;

/** How far a queued item may sit from its place and still count as queued. */
const QUEUE_EPSILON = 1e-9;

/**
 * The indices of `edge`'s items queued at its input connector: the front
 * one, once it waits there, and each one stopped right behind it.
 */
function queued(edge: Edge): number[] {
  const spacing = spacingUnits(edge);
  const indices: number[] = [];
  let place = edgeUnits(edge);
  for (const [i, it] of edge.items.entries()) {
    if (it.pos < place - QUEUE_EPSILON) break;
    indices.push(i);
    place = it.pos - spacing;
  }
  return indices;
}

/**
 * Takes out of `edge` the first item queued at its input connector that
 * `wanted` passes, from the `skip`th on, the front one first; the others keep
 * their place.
 */
function takeQueued(
  edge: Edge,
  wanted: (item: ItemId) => boolean,
  skip = 0,
): ItemId | undefined {
  const i = queued(edge)
    .slice(skip)
    .find((i) => wanted(edge.items[i].item));
  return i === undefined ? undefined : edge.items.splice(i, 1)[0].item;
}

/**
 * Hands `deliver` the first item queued behind a refused front item that it
 * takes, one per tick; the refused ones keep their place. So an item the
 * node refuses never jams the edge for the others (FR57). A type refused
 * once is not offered again this tick.
 */
function bypass(edge: Edge, deliver: (item: ItemId) => boolean): void {
  const refused = new Set<ItemId>([edge.items[0].item]);
  const takes = (item: ItemId) => {
    if (refused.has(item)) return false;
    if (deliver(item)) return true;
    refused.add(item);
    return false;
  };
  takeQueued(edge, takes, 1);
}

/**
 * Moves an edge's items one tick. Each item moves `STEP_UNITS` but keeps its
 * spacing to the one ahead. The front item leaves through `deliver` on the
 * tick it reaches the input connector; while that refuses it, it waits there
 * and the items queued behind it are offered instead, so only the ones the
 * node refuses back up (FR57). Once the last item has left room, a new one
 * enters from `take`, of any type (FR56); it keeps what the last one moved
 * past the spacing, so the edge carries exactly its throughput. A last item
 * delivered this tick still counts, where it would have moved to, so a short
 * edge cannot skip the spacing.
 */
export function stepEdge(
  edge: Edge,
  take: () => ItemId | undefined,
  deliver: (item: ItemId) => boolean,
): void {
  const { items } = edge;
  const end = edgeUnits(edge);
  const spacing = spacingUnits(edge);
  for (const it of items) it.prevPos = it.pos;
  let delivered: number | undefined;
  while (items.length > 0 && items[0].pos + STEP_UNITS >= end) {
    if (!deliver(items[0].item)) break;
    delivered = items.shift()!.pos + STEP_UNITS;
  }
  if (items.length > 1 && items[0].pos >= end) bypass(edge, deliver);
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

/** True when `edge` exists and has room at its output connector for an item. */
function isOpen(edge: Edge | undefined): boolean {
  if (!edge) return false;
  const back = edge.items.at(-1);
  return !back || back.pos >= spacingUnits(edge);
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

function isRouter(node: FactoryNode): node is RouterNode {
  return node.kind === "splitter" || node.kind === "merger";
}

/** How many items `edge` holds at most, spaced out. */
function slots(edge: Edge): number {
  return Math.floor(edgeUnits(edge) / spacingUnits(edge)) + 1;
}

/**
 * Whether an item may go onto `edge` for the node `target`, counting the
 * items already on their way to it: on its input edges and on those of the
 * Splitters and Mergers that feed it, but not beyond the router `from` that
 * asks. A machine gets only what it needs: of each input, what its buffer
 * holds plus a share of the edge's slots, in proportion to what a batch
 * needs, less one slot. So the inputs it refuses never fill the edge, and
 * the one it lacks always finds room. Storage gets items while it has room.
 * A Splitter or Merger takes what any node it leads to takes.
 */
function acceptor(
  state: GameState,
  links: Links,
  edge: Edge,
  from?: NodeId,
): (item: ItemId) => boolean {
  const pending = new Map<NodeId, ItemCounts>();
  // Whether each buffer node has room; the same for every item.
  const room = new Map<NodeId, boolean>();
  const pendingOf = (id: NodeId) => {
    let counts = pending.get(id);
    if (counts) return counts;
    pending.set(id, (counts = {}));
    const seen = new Set<NodeId>();
    const visit = (to: NodeId) => {
      seen.add(to);
      for (const edge of links.inputs.get(to) ?? []) {
        if (!edge) continue;
        for (const { item } of edge.items)
          counts[item] = (counts[item] ?? 0) + 1;
        const source = state.nodes.get(edge.from);
        if (
          source &&
          isRouter(source) &&
          source.id !== from &&
          !seen.has(source.id)
        ) {
          visit(source.id);
        }
      }
    };
    visit(id);
    return counts;
  };
  const takes = (into: Edge, item: ItemId, seen: Set<NodeId>): boolean => {
    const id = into.to;
    const node = state.nodes.get(id);
    if (!node) return false;
    if (isRouter(node)) {
      if (seen.has(id)) return false;
      seen.add(id);
      const outputs = links.outputs.get(id) ?? [];
      return outputs.some((edge) => edge && takes(edge, item, seen));
    }
    if (!isBuffer(node)) {
      if (!inputTakes(node, into.toPort, item)) return false;
      const coming = pendingOf(id);
      const needs = inputNeeds(node, item, coming);
      const need = needs[item];
      if (!need) return false;
      const all = Object.values(needs).reduce((a, b) => a + b, 0);
      const share = Math.floor(((slots(edge) - 1) * need) / all);
      const held = heldInput(node, item) + (coming[item] ?? 0);
      return held < inputLimit(node, need) + share;
    }
    let has = room.get(id);
    if (has === undefined) {
      const coming = Object.values(pendingOf(id)).reduce((a, b) => a + b, 0);
      room.set(id, (has = bufferRoom(state, node) > coming));
    }
    return has;
  };
  return (item) => takes(edge, item, new Set());
}

/**
 * Hands the output edge on `port` of a Splitter an item queued at its input,
 * when that output's turn has come (FR37). The turn goes round the outputs
 * and skips each one that could take no item now, or whose node would
 * refuse this one, so a blocked or missing output never holds the others
 * up. An item no output takes waits, and the ones behind it pass.
 */
function split(state: GameState, node: RouterNode, port: number, links: Links) {
  const input = links.inputs.get(node.id)?.[0];
  if (!input) return undefined;
  const outputs = links.outputs.get(node.id) ?? [];
  const count = NODES[node.kind].outputs;
  const takes = outputs.map(
    (edge) => edge && acceptor(state, links, edge, node.id),
  );
  const turnOf = (item: ItemId) =>
    nextInTurn(
      node,
      count,
      (t) => (t === port || isOpen(outputs[t])) && !!takes[t]?.(item),
    );
  for (const i of queued(input)) {
    const turn = turnOf(input.items[i].item);
    if (turn === undefined) continue;
    if (turn !== port) return undefined;
    node.next = (port + 1) % count;
    return input.items.splice(i, 1)[0].item;
  }
  return undefined;
}

/**
 * Hands a Merger's output edge an item queued at its next input in turn
 * that has one its target takes, so every busy input gets an equal share
 * (FR38).
 */
function merge(state: GameState, node: RouterNode, edge: Edge, links: Links) {
  const inputs = links.inputs.get(node.id) ?? [];
  const count = NODES[node.kind].inputs;
  const takes = acceptor(state, links, edge, node.id);
  let item: ItemId | undefined;
  const turn = nextInTurn(node, count, (t) => {
    const input = inputs[t];
    item = input && takeQueued(input, takes);
    return item !== undefined;
  });
  if (turn !== undefined) node.next = (turn + 1) % count;
  return item;
}

/** Takes the next item for `edge` from the node it leaves. */
function take(state: GameState, node: FactoryNode, edge: Edge, links: Links) {
  if (node.kind === "splitter") return split(state, node, edge.fromPort, links);
  if (node.kind === "merger") return merge(state, node, edge, links);
  // Storage sends only what its target takes, so no item it sends jams.
  if (isBuffer(node)) return takeOldest(node, acceptor(state, links, edge));
  return takeOutput(node);
}

/** Hands `item` to `node` through input `port`; returns whether it entered. */
function deliver(
  state: GameState,
  node: FactoryNode,
  item: ItemId,
  port: number,
): boolean {
  if (!isBuffer(node)) return acceptItem(node, item, port);
  if (bufferRoom(state, node) < 1) return false;
  store(node, item, 1);
  return true;
}

/**
 * True when a Splitter or Merger has items waiting and none of its outputs
 * can take any of them: each output is blocked, or its node refuses them
 * (FR37).
 */
function isBlocked(state: GameState, node: RouterNode, links: Links): boolean {
  const waiting = (links.inputs.get(node.id) ?? []).flatMap((edge) =>
    edge ? queued(edge).map((i) => edge.items[i].item) : [],
  );
  if (waiting.length === 0) return false;
  return !(links.outputs.get(node.id) ?? []).some((edge) => {
    if (!isOpen(edge)) return false;
    const takes = acceptor(state, links, edge, node.id);
    return waiting.some(takes);
  });
}

/** Reports a Splitter or Merger that became blocked, or ran again. */
function updateRouter(
  state: GameState,
  node: RouterNode,
  links: Links,
  emit: Emit,
) {
  const blocked = isBlocked(state, node, links);
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
      () => take(state, from, edge, links),
      (item) => deliver(state, to, item, edge.toPort),
    );
  }
  for (const node of state.nodes.values()) {
    if (isRouter(node)) updateRouter(state, node, links, emit);
  }
};
