import { Container, Graphics } from "pixi.js";
import type { NodeKind } from "../data/nodes";
import { railPorts } from "../sim/rail/station";
import type { FactoryNode } from "../sim/state/gameState";
import type { NodeId } from "../sim/state/ids";
import { cellCentre } from "./connectors";
import type { DeepReadonly } from "./readonly";
import { CATEGORY_COLOR, CELL_PX, MOVING_ALPHA, PALETTE } from "./theme";

/** Radius of a rail port's circle, in world units. */
const RAIL_PORT_R = CELL_PX * 0.26;
const RAIL_PORT_COLOR = CATEGORY_COLOR.rail;

/**
 * Draws a Station's rail ports into `g`, relative to the card's top-left
 * corner: a ring in the cell just outside each side, where its rail leaves,
 * tied to the card by a short stub. Other kinds have none.
 */
export function drawRailPorts(g: Graphics, kind: NodeKind): Graphics {
  if (kind !== "station") return g;
  for (const { side, cell } of railPorts({ kind, x: 0, y: 0 })) {
    const c = cellCentre(cell);
    const edge = side === "left" ? c.x + CELL_PX / 2 : c.x - CELL_PX / 2;
    g.moveTo(edge, c.y)
      .lineTo(c.x, c.y)
      .stroke({ color: RAIL_PORT_COLOR, width: 3 });
    g.circle(c.x, c.y, RAIL_PORT_R)
      .fill(PALETTE.ground)
      .stroke({ color: RAIL_PORT_COLOR, width: 2.5 });
    g.circle(c.x, c.y, RAIL_PORT_R * 0.35).fill(RAIL_PORT_COLOR);
  }
  return g;
}

type NodeView = DeepReadonly<FactoryNode>;

/**
 * Keeps the rail ports of every Station drawn in `layer`, the rail layer,
 * diffing the state's nodes against the drawn ones each frame.
 */
export class RailPortViews {
  private readonly views = new Map<NodeId, { node: NodeView; g: Graphics }>();

  constructor(private readonly layer: Container) {}

  /** `faded` names the node being moved, drawn faint, or none with `null`. */
  sync(nodes: ReadonlyMap<NodeId, NodeView>, faded: NodeId | null = null) {
    for (const [id, view] of this.views) {
      if (nodes.get(id) !== view.node) {
        view.g.destroy();
        this.views.delete(id);
      }
    }
    for (const [id, node] of nodes) {
      if (node.kind !== "station" || this.views.has(id)) continue;
      const g = drawRailPorts(
        new Graphics({ label: `rail-ports:${id}` }),
        node.kind,
      );
      g.position.set(node.x * CELL_PX, node.y * CELL_PX);
      this.layer.addChild(g);
      this.views.set(id, { node, g });
    }
    for (const [id, { g }] of this.views) {
      g.alpha = id === faded ? MOVING_ALPHA : 1;
    }
  }

  /** Drops every drawing, so the next `sync` draws them all again. */
  clear() {
    for (const { g } of this.views.values()) g.destroy();
    this.views.clear();
  }
}
