import { countsAbove, type ItemCounts } from "../../data/items";
import { NODES, type NodeKind } from "../../data/nodes";
import type { Emit } from "../events";
import { fail, ok, type Result } from "../result";
import type { FactoryNode, GameState } from "../state/gameState";
import type { NodeId } from "../state/ids";
import { isUnlocked, nodeRect } from "../state/nodes";
import { canAfford, debit, deposit } from "../state/stock";
import type { Command } from "./command";

/** What raising a node of kind `from` to kind `to` costs: the difference (FR22). */
export function nodeUpgradeCost(from: NodeKind, to: NodeKind): ItemCounts {
  return countsAbove(NODES[from].cost, NODES[to].cost);
}

/**
 * Raises a node to the kind its data names as its upgrade (a Montadora 1 to
 * a Montadora 2), in place, paying the difference in cost (FR22). The node
 * keeps its id, connectors, edges, recipe and buffers; research gates the
 * new kind.
 */
export class UpgradeNode implements Command {
  readonly type = "UpgradeNode";
  private from?: NodeKind;

  constructor(readonly id: NodeId) {}

  validate(state: Readonly<GameState>): Result {
    const node = state.nodes.get(this.id);
    if (!node) return fail("not_found");
    const next = NODES[node.kind].upgrade;
    if (!next) return fail("max_level");
    if (!isUnlocked(state, next)) return fail("locked");
    return canAfford(state, nodeUpgradeCost(node.kind, next))
      ? ok()
      : fail("no_stock");
  }

  apply(state: GameState, emit: Emit) {
    const node = state.nodes.get(this.id)!;
    const next = NODES[node.kind].upgrade!;
    const site = nodeRect(node);
    const draws = debit(state, nodeUpgradeCost(node.kind, next), site);
    this.from = node.kind;
    state.nodes.set(this.id, withKind(node, next));
    emit({ type: "ConstructionPaid", site, draws });
  }

  invert(): Command {
    if (!this.from) throw new Error("UpgradeNode was not applied");
    return new DowngradeNode(this.id, this.from);
  }
}

/**
 * Lowers an upgraded node back to kind `to`, as the undo of `UpgradeNode`,
 * refunding the difference.
 */
class DowngradeNode implements Command {
  readonly type = "DowngradeNode";

  constructor(
    private readonly id: NodeId,
    private readonly to: NodeKind,
  ) {}

  validate(state: Readonly<GameState>): Result {
    const node = state.nodes.get(this.id);
    return node && NODES[this.to].upgrade === node.kind
      ? ok()
      : fail("not_found");
  }

  apply(state: GameState) {
    const node = state.nodes.get(this.id)!;
    deposit(state, nodeUpgradeCost(this.to, node.kind), nodeRect(node));
    state.nodes.set(this.id, withKind(node, this.to));
  }

  invert(): Command {
    return new UpgradeNode(this.id);
  }
}

/**
 * The node as kind `kind`: a new object, so the renderer sees the change. An
 * upgrade keeps the size and connectors, so the rest carries over.
 */
function withKind(node: FactoryNode, kind: NodeKind): FactoryNode {
  return { ...node, kind } as FactoryNode;
}
