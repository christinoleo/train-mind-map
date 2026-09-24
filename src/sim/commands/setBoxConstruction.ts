import { fail, ok, type Result } from "../result";
import type { GameState } from "../state/gameState";
import type { NodeId } from "../state/ids";
import type { Command } from "./command";

/**
 * Sets a Box's "não usar em construção" option (FR71): while it is on,
 * construction neither draws from the Box nor refunds into it, so a
 * production buffer keeps its items. Its inverse sets the option back.
 */
export class SetBoxConstruction implements Command {
  readonly type = "SetBoxConstruction";
  private previous?: boolean;

  constructor(
    readonly id: NodeId,
    readonly noConstruction: boolean,
  ) {}

  validate(state: Readonly<GameState>): Result {
    return boxNode(state, this.id) ? ok() : fail("not_found");
  }

  apply(state: GameState) {
    const node = boxNode(state, this.id)!;
    this.previous = node.noConstruction;
    node.noConstruction = this.noConstruction;
  }

  invert(): Command {
    if (this.previous === undefined) {
      throw new Error("SetBoxConstruction was not applied");
    }
    return new SetBoxConstruction(this.id, this.previous);
  }
}

function boxNode(state: Readonly<GameState>, id: NodeId) {
  const node = state.nodes.get(id);
  return node?.kind === "box" ? node : undefined;
}
