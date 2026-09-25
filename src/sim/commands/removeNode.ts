import { addCounts, itemEntries, type ItemCounts } from "../../data/items";
import { NODES } from "../../data/nodes";
import type { Emit } from "../events";
import { buildPlanarIndex } from "../geometry/planar";
import { fail, ok, type Result } from "../result";
import { railsOf } from "../rail/rails";
import { isRailInUse, isStationInUse } from "../rail/trains";
import { checkRestore, edgesOf } from "../state/edges";
import type { Edge, FactoryNode, GameState, Rail } from "../state/gameState";
import type { NodeId } from "../state/ids";
import { checkFootprint, nodeRect } from "../state/nodes";
import { bufferedItems } from "../state/production";
import {
  canAfford,
  coreNode,
  debit,
  deposit,
  isBuffer,
  store,
  storedItems,
  withdraw,
} from "../state/stock";
import type { Command } from "./command";
import { putBackEdge, takeOutEdge } from "./removeEdge";
import { checkPutBackRails, putBackRail, takeOutRail } from "./removeRail";

/** An edge removed along with its node, and what its removal refunded. */
interface RemovedEdge {
  edge: Edge;
  refunded: ItemCounts;
}

/** A rail removed along with its Station, and what its removal refunded. */
interface RemovedRail {
  rail: Rail;
  refunded: ItemCounts;
}

/**
 * Removes a node and refunds its whole cost to storage (FR21), and removes
 * the edges attached to it the same way (FR59). The items inside the node,
 * in a Box, a Station or a machine's buffers, go to the Core, and its undo
 * takes them back. A Station takes its rails with it. The Core is
 * indestructible.
 */
export class RemoveNode implements Command {
  readonly type = "RemoveNode";
  private removed?: FactoryNode;
  /** What the refund put into storage: the cost, less what found no room. */
  private refunded?: ItemCounts;
  /** The items that were inside the node, now in the Core. */
  private contents: ItemCounts = {};
  private edges: RemovedEdge[] = [];
  private rails: RemovedRail[] = [];

  constructor(readonly id: NodeId) {}

  validate(state: Readonly<GameState>): Result {
    const node = state.nodes.get(this.id);
    if (!node) return fail("not_found");
    if (node.kind === "core") return fail("indestructible");
    // A Station takes its rails with it, and a trip under way may cross them.
    const inUse =
      isStationInUse(state, this.id) ||
      railsOf(state, this.id).some((rail) => isRailInUse(state, rail.id));
    return inUse ? fail("has_trains") : ok();
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
    this.rails = railsOf(state, this.id).map((rail) => ({
      rail,
      refunded: takeOutRail(state, rail),
    }));
    this.refunded = deposit(state, NODES[node.kind].cost, nodeRect(node));
    this.contents = contentsOf(node);
    const core = coreNode(state);
    for (const [item, count] of itemEntries(this.contents)) {
      store(core, item, count);
    }
  }

  invert(): Command {
    if (!this.removed || !this.refunded) {
      throw new Error("RemoveNode was not applied");
    }
    return new RestoreNode(
      this.removed,
      this.refunded,
      this.contents,
      this.edges,
      this.rails,
    );
  }
}

/** The items inside `node`: what a Box or Station holds, or its buffers. */
function contentsOf(node: FactoryNode): ItemCounts {
  return isBuffer(node) ? storedItems(node) : bufferedItems(node);
}

/**
 * Puts a removed node back with its id, as the undo of `RemoveNode`, and the
 * edges and rails removed with it. It takes back the refunds, only as much
 * of each cost as storage had room for, and takes the node's items back out
 * of the Core, so the node comes back as it was.
 */
class RestoreNode implements Command {
  readonly type = "RestoreNode";

  constructor(
    private readonly node: FactoryNode,
    private readonly refunded: ItemCounts,
    private readonly contents: ItemCounts,
    private readonly edges: readonly RemovedEdge[],
    private readonly rails: readonly RemovedRail[],
  ) {}

  validate(state: Readonly<GameState>): Result {
    const { id, kind, x, y } = this.node;
    if (state.nodes.has(id)) return fail("occupied");
    const core = storedItems(coreNode(state));
    const inCore = itemEntries(this.contents).every(
      ([item, count]) => (core[item] ?? 0) >= count,
    );
    const total = addCounts(this.totalRefund(), this.contents);
    if (!inCore || !canAfford(state, total)) return fail("no_stock");
    const fits = checkFootprint(state, kind, x, y);
    if (!fits.ok) return fail(fits.reason);
    const index = buildPlanarIndex(state);
    for (const { edge } of this.edges) {
      const back = checkRestore(state, index, edge, this.node);
      if (!back.ok) return back;
    }
    return checkPutBackRails(
      state,
      this.rails.map(({ rail }) => rail),
      this.node,
    );
  }

  apply(state: GameState, emit: Emit) {
    const node = structuredClone(this.node);
    const core = coreNode(state);
    for (const [item, count] of itemEntries(this.contents)) {
      withdraw(core, item, count);
    }
    const site = nodeRect(node);
    const draws = debit(state, this.refunded, site);
    state.nodes.set(node.id, node);
    emit({ type: "ConstructionPaid", site, draws });
    for (const { edge, refunded } of this.edges) {
      putBackEdge(state, edge, refunded, emit);
    }
    for (const { rail, refunded } of this.rails) {
      putBackRail(state, rail, refunded, emit);
    }
  }

  invert(): Command {
    return new RemoveNode(this.node.id);
  }

  /** Everything the removal refunded, node, edges and rails together. */
  private totalRefund(): ItemCounts {
    const total: ItemCounts = { ...this.refunded };
    for (const { refunded } of [...this.edges, ...this.rails]) {
      addCounts(total, refunded);
    }
    return total;
  }
}
