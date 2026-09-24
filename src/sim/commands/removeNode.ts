import { addCounts, type ItemCounts } from "../../data/items";
import { NODES } from "../../data/nodes";
import type { Emit } from "../events";
import { buildPlanarIndex } from "../geometry/planar";
import { fail, ok, type Result } from "../result";
import { checkRestore, edgesOf } from "../state/edges";
import type { Edge, FactoryNode, GameState } from "../state/gameState";
import type { NodeId } from "../state/ids";
import { checkFootprint, nodeRect } from "../state/nodes";
import { isProducer, newProduction } from "../state/production";
import { canAfford, debit, deposit, isStorage } from "../state/stock";
import type { Command } from "./command";
import { putBackEdge, takeOutEdge } from "./removeEdge";

/** An edge removed along with its node, and what its removal refunded. */
interface RemovedEdge {
  edge: Edge;
  refunded: ItemCounts;
}

/**
 * Removes a node and refunds its whole cost to storage (FR21), and removes
 * the edges attached to it the same way (FR59). The items inside the node
 * are lost, so its undo brings it back empty. The Core is indestructible.
 */
export class RemoveNode implements Command {
  readonly type = "RemoveNode";
  private removed?: FactoryNode;
  /** What the refund put into storage: the cost, less what found no room. */
  private refunded?: ItemCounts;
  private edges: RemovedEdge[] = [];

  constructor(readonly id: NodeId) {}

  validate(state: Readonly<GameState>): Result {
    const node = state.nodes.get(this.id);
    if (!node) return fail("not_found");
    return node.kind === "core" ? fail("indestructible") : ok();
  }

  apply(state: GameState) {
    const node = state.nodes.get(this.id)!;
    this.removed = node;
    const attached = edgesOf(state, this.id);
    // The node goes first, so no refund lands in the storage being removed.
    state.nodes.delete(this.id);
    this.edges = attached.map((edge) => ({
      edge,
      refunded: takeOutEdge(state, edge),
    }));
    this.refunded = deposit(state, NODES[node.kind].cost, nodeRect(node));
  }

  invert(): Command {
    if (!this.removed || !this.refunded) {
      throw new Error("RemoveNode was not applied");
    }
    return new RestoreNode(this.removed, this.refunded, this.edges);
  }
}

/**
 * Puts a removed node back with its id, as the undo of `RemoveNode`, and the
 * edges removed with it. It takes back the refunds, only as much of each cost
 * as storage had room for, and the node comes back empty: its items were
 * lost.
 */
class RestoreNode implements Command {
  readonly type = "RestoreNode";

  constructor(
    private readonly node: FactoryNode,
    private readonly refunded: ItemCounts,
    private readonly edges: readonly RemovedEdge[],
  ) {}

  validate(state: Readonly<GameState>): Result {
    const { id, kind, x, y } = this.node;
    if (state.nodes.has(id)) return fail("occupied");
    if (!canAfford(state, this.totalRefund())) return fail("no_stock");
    const fits = checkFootprint(state, kind, x, y);
    if (!fits.ok) return fail(fits.reason);
    const index = buildPlanarIndex(state);
    for (const { edge } of this.edges) {
      const back = checkRestore(state, index, edge, this.node);
      if (!back.ok) return back;
    }
    return ok();
  }

  apply(state: GameState, emit: Emit) {
    const node = structuredClone(this.node);
    if (isProducer(node)) node.production = newProduction();
    if (isStorage(node)) node.items = {};
    const site = nodeRect(node);
    const draws = debit(state, this.refunded, site);
    state.nodes.set(node.id, node);
    emit({ type: "ConstructionPaid", site, draws });
    for (const { edge, refunded } of this.edges) {
      putBackEdge(state, edge, refunded, emit);
    }
  }

  invert(): Command {
    return new RemoveNode(this.node.id);
  }

  /** Everything the removal refunded, node and edges together. */
  private totalRefund(): ItemCounts {
    const total: ItemCounts = { ...this.refunded };
    for (const { refunded } of this.edges) addCounts(total, refunded);
    return total;
  }
}
