// Where connectors and edges sit in the world, in world units. It has no
// Pixi in it, so input hit tests share it with the renderer.

import { NODES, type NodeKind } from "../data/nodes";
import type { Point } from "../sim/geometry/planar";
import { connectorRows, type ConnectorSide } from "../sim/state/edges";
import type { Edge, FactoryNode } from "../sim/state/gameState";
import type { EdgeId, NodeId } from "../sim/state/ids";
import { CELL_PX } from "./theme";

type Placed = Pick<FactoryNode, "kind" | "x" | "y">;

interface ConnectorPoints {
  inputs: readonly Point[];
  outputs: readonly Point[];
}

const pointsByKind = new Map<NodeKind, ConnectorPoints>();

/**
 * Where a card's connectors sit, relative to its top-left corner: inputs on
 * the left edge, outputs on the right, each centred on the row its edge
 * leaves or enters by (FR15). Connectors that share a row split it. They
 * depend only on the kind, so each kind is worked out once.
 */
export function connectorPoints(kind: NodeKind): ConnectorPoints {
  let points = pointsByKind.get(kind);
  if (!points) {
    points = computeConnectorPoints(kind);
    pointsByKind.set(kind, points);
  }
  return points;
}

function computeConnectorPoints(kind: NodeKind): ConnectorPoints {
  const { size, inputs, outputs } = NODES[kind];
  const spread = (n: number, x: number) => {
    const rows = connectorRows(n, size);
    return rows.map((row, i) => {
      const shared = rows.filter((r) => r === row).length;
      const nth = rows.slice(0, i).filter((r) => r === row).length;
      return { x, y: (row + (nth + 0.5) / shared) * CELL_PX };
    });
  };
  return {
    inputs: spread(inputs, 0),
    outputs: spread(outputs, size * CELL_PX),
  };
}

/** Every connector of `node` on `side`, in the world, by port. */
export function connectorsOf(node: Placed, side: ConnectorSide): Point[] {
  const points = connectorPoints(node.kind);
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
