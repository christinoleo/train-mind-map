// Where connectors and edges sit in the world, in world units. It has no
// Pixi in it, so input hit tests share it with the renderer.

import { NODES } from "../data/nodes";
import type { Point } from "../sim/geometry/planar";
import {
  connectorCount,
  connectorRows,
  type ConnectorSide,
} from "../sim/state/edges";
import type { Edge, FactoryNode } from "../sim/state/gameState";
import type { EdgeId, NodeId } from "../sim/state/ids";
import type { Typed } from "../sim/state/production";
import { CELL_PX } from "./theme";

type Placed = Typed & Pick<FactoryNode, "x" | "y">;

interface ConnectorPoints {
  inputs: readonly Point[];
  outputs: readonly Point[];
}

/** Worked-out points, by kind and input count. */
const pointsByShape = new Map<string, ConnectorPoints>();

/**
 * Where a card's connectors sit, relative to its top-left corner: inputs on
 * the left edge, outputs on the right, each centred on the row its edge
 * leaves or enters by (FR15). They depend only on the kind and, on a
 * production node, how many inputs its recipe gives it (FR25), so each shape
 * is worked out once.
 */
export function connectorPoints(node: Typed): ConnectorPoints {
  const inputs = connectorCount(node, "input");
  const key = `${node.kind}:${inputs}`;
  let points = pointsByShape.get(key);
  if (!points) {
    const { size, outputs } = NODES[node.kind];
    const spread = (n: number, x: number) =>
      connectorRows(n, size).map((row) => ({ x, y: (row + 0.5) * CELL_PX }));
    points = {
      inputs: spread(inputs, 0),
      outputs: spread(outputs, size * CELL_PX),
    };
    pointsByShape.set(key, points);
  }
  return points;
}

/** Every connector of `node` on `side`, in the world, by port. */
export function connectorsOf(node: Placed, side: ConnectorSide): Point[] {
  const points = connectorPoints(node);
  return (side === "input" ? points.inputs : points.outputs).map((p) => ({
    x: node.x * CELL_PX + p.x,
    y: node.y * CELL_PX + p.y,
  }));
}

/** The centre of cell `p`. */
export function cellCentre(p: Point): Point {
  return { x: (p.x + 0.5) * CELL_PX, y: (p.y + 0.5) * CELL_PX };
}

/**
 * The line an edge is drawn along: from its output connector through the
 * centres of its route's cells to its input connector, or to the last cell
 * while it is still being dragged.
 */
export function edgeLine(
  from: Point,
  path: readonly Point[],
  to?: Point,
): Point[] {
  const line = [from, ...path.map(cellCentre)];
  if (to) line.push(to);
  return line;
}

/**
 * The line built edge `edge` is drawn along, from its nodes in `nodes`, or
 * `null` while either node is missing. Drawing and tap hit tests share it.
 */
export function edgeLineOf(
  edge: Pick<Edge, "from" | "fromPort" | "to" | "toPort"> & {
    path: readonly Point[];
  },
  nodes: ReadonlyMap<NodeId, Placed>,
): Point[] | null {
  const out = nodes.get(edge.from);
  const into = nodes.get(edge.to);
  if (!out || !into) return null;
  return edgeLine(
    connectorsOf(out, "output")[edge.fromPort],
    edge.path,
    connectorsOf(into, "input")[edge.toPort],
  );
}

/**
 * The lines edges of `edges` are drawn along on the new routes of `moved`,
 * from their nodes in `nodes` (FR52).
 */
export function reroutedLines(
  moved: readonly { id: EdgeId; path: readonly Point[] }[],
  edges: ReadonlyMap<EdgeId, Edge>,
  nodes: ReadonlyMap<NodeId, Placed>,
): Point[][] {
  return moved.flatMap(({ id, path }) => {
    const line = edgeLineOf({ ...edges.get(id)!, path }, nodes);
    return line ? [line] : [];
  });
}

/** The line a rail is drawn along: the centres of its route's cells. */
export function railLine(path: readonly Point[]): Point[] {
  return path.map(cellCentre);
}
