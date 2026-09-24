import { fail, ok, type Result } from "../result";
import type { FactoryNode, GameState } from "../state/gameState";
import type { NodeId } from "../state/ids";
import { checkFootprint } from "../state/nodes";
import type { Command } from "./command";

/** Removes a node. The Core is indestructible. */
export class RemoveNode implements Command {
  readonly type = "RemoveNode";
  private removed?: FactoryNode;

  constructor(readonly id: NodeId) {}

  validate(state: Readonly<GameState>): Result {
    const node = state.nodes.get(this.id);
    if (!node) return fail("not_found");
    return node.kind === "core" ? fail("indestructible") : ok();
  }

  apply(state: GameState) {
    this.removed = state.nodes.get(this.id);
    state.nodes.delete(this.id);
  }

  invert(): Command {
    if (!this.removed) throw new Error("RemoveNode was not applied");
    return new RestoreNode(this.removed);
  }
}

/** Puts a removed node back with its id, as the undo of `RemoveNode`. */
class RestoreNode implements Command {
  readonly type = "RestoreNode";

  constructor(private readonly node: FactoryNode) {}

  validate(state: Readonly<GameState>): Result {
    const { id, kind, x, y } = this.node;
    if (state.nodes.has(id)) return fail("occupied");
    const fits = checkFootprint(state, kind, x, y);
    return fits.ok ? ok() : fail(fits.reason);
  }

  apply(state: GameState) {
    state.nodes.set(this.node.id, structuredClone(this.node));
  }

  invert(): Command {
    return new RemoveNode(this.node.id);
  }
}
