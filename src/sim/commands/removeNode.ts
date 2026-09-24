import type { ItemCounts } from "../../data/items";
import { NODES } from "../../data/nodes";
import type { Emit } from "../events";
import { fail, ok, type Result } from "../result";
import type { FactoryNode, GameState } from "../state/gameState";
import type { NodeId } from "../state/ids";
import { checkFootprint, nodeRect } from "../state/nodes";
import { isProducer, newProduction } from "../state/production";
import { canAfford, debit, deposit, isStorage } from "../state/stock";
import type { Command } from "./command";

/**
 * Removes a node and refunds its whole cost to storage (FR21). The items
 * inside the node are lost, so its undo brings it back empty. The Core is
 * indestructible.
 */
export class RemoveNode implements Command {
  readonly type = "RemoveNode";
  private removed?: FactoryNode;
  /** What the refund put into storage: the cost, less what found no room. */
  private refunded?: ItemCounts;

  constructor(readonly id: NodeId) {}

  validate(state: Readonly<GameState>): Result {
    const node = state.nodes.get(this.id);
    if (!node) return fail("not_found");
    return node.kind === "core" ? fail("indestructible") : ok();
  }

  apply(state: GameState) {
    const node = state.nodes.get(this.id)!;
    this.removed = node;
    state.nodes.delete(this.id);
    this.refunded = deposit(state, NODES[node.kind].cost, nodeRect(node));
  }

  invert(): Command {
    if (!this.removed || !this.refunded) {
      throw new Error("RemoveNode was not applied");
    }
    return new RestoreNode(this.removed, this.refunded);
  }
}

/**
 * Puts a removed node back with its id, as the undo of `RemoveNode`. It takes
 * back the refund, only as much of the cost as storage had room for, and the
 * node comes back empty: its items were lost.
 */
class RestoreNode implements Command {
  readonly type = "RestoreNode";

  constructor(
    private readonly node: FactoryNode,
    private readonly refunded: ItemCounts,
  ) {}

  validate(state: Readonly<GameState>): Result {
    const { id, kind, x, y } = this.node;
    if (state.nodes.has(id)) return fail("occupied");
    if (!canAfford(state, this.refunded)) return fail("no_stock");
    const fits = checkFootprint(state, kind, x, y);
    return fits.ok ? ok() : fail(fits.reason);
  }

  apply(state: GameState, emit: Emit) {
    const node = structuredClone(this.node);
    if (isProducer(node)) node.production = newProduction();
    if (isStorage(node)) node.items = {};
    const draws = debit(state, this.refunded, nodeRect(node));
    state.nodes.set(node.id, node);
    emit({ type: "ConstructionPaid", site: node.id, draws });
  }

  invert(): Command {
    return new RemoveNode(this.node.id);
  }
}
