import { UNDO_DEPTH } from "../../config/constants";
import type { Emit } from "../events";
import { fail, type Result } from "../result";
import type { GameState } from "../state/gameState";
import type { Command } from "./command";

interface Queued {
  command: Command;
  /** An undo's own inverse is not pushed back onto the undo stack. */
  undo: boolean;
}

/**
 * The single entry point for state changes. Commands are validated when
 * dispatched, queued, and applied at the start of the next tick in arrival
 * order, each revalidated first.
 */
export class CommandQueue {
  private queued: Queued[] = [];
  private undoStack: Command[] = [];
  /** Every command applied, with the tick it was applied at, in order. */
  readonly replayLog: [tick: number, command: Command][] = [];

  dispatch(state: Readonly<GameState>, command: Command): Result {
    return this.enqueue(state, command, false);
  }

  /** Queues the inverse of the latest applied command. */
  undo(state: Readonly<GameState>): Result {
    const inverse = this.undoStack.pop();
    if (!inverse) return fail("nothing_to_undo");
    return this.enqueue(state, inverse, true);
  }

  get undoDepth(): number {
    return this.undoStack.length;
  }

  /** Applies everything queued. A command that no longer validates is dropped. */
  applyQueued(state: GameState, emit: Emit): void {
    const queued = this.queued;
    this.queued = [];
    for (const { command, undo } of queued) {
      const result = command.validate(state);
      if (!result.ok) {
        emit({
          type: "CommandRejected",
          command: command.type,
          reason: result.reason,
        });
        continue;
      }
      command.apply(state);
      this.replayLog.push([state.tick, command]);
      if (undo) continue;
      this.undoStack.push(command.invert());
      if (this.undoStack.length > UNDO_DEPTH) this.undoStack.shift();
    }
  }

  private enqueue(
    state: Readonly<GameState>,
    command: Command,
    undo: boolean,
  ): Result {
    const result = command.validate(state);
    if (result.ok) this.queued.push({ command, undo });
    return result;
  }
}
