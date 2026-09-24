import type { Command } from "../../../src/sim/commands/command";
import { fail, ok } from "../../../src/sim/result";
import type { GameState } from "../../../src/sim/state/gameState";
import { allocateId, type NodeId } from "../../../src/sim/state/ids";

/** Adds a bare node. Its inverse removes it again. */
export class AddNode implements Command {
  readonly type = "AddNode";
  private placed?: NodeId;

  validate() {
    return ok();
  }

  apply(state: GameState) {
    const id = allocateId(state.nextIds, "node");
    state.nodes.set(id, { id });
    this.placed = id;
  }

  invert(): Command {
    if (this.placed === undefined) throw new Error("AddNode was not applied");
    return new RemoveNode(this.placed);
  }
}

/** Removes a node by id. Its inverse puts the same node back. */
export class RemoveNode implements Command {
  readonly type = "RemoveNode";

  constructor(private readonly id: NodeId) {}

  validate(state: Readonly<GameState>) {
    return state.nodes.has(this.id) ? ok() : fail("not_found");
  }

  apply(state: GameState) {
    state.nodes.delete(this.id);
  }

  invert(): Command {
    return new RestoreNode(this.id);
  }
}

class RestoreNode implements Command {
  readonly type = "RestoreNode";

  constructor(private readonly id: NodeId) {}

  validate(state: Readonly<GameState>) {
    return state.nodes.has(this.id) ? fail("not_found") : ok();
  }

  apply(state: GameState) {
    state.nodes.set(this.id, { id: this.id });
  }

  invert(): Command {
    return new RemoveNode(this.id);
  }
}
