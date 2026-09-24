import { UNDO_DEPTH } from "../../config/constants";
import type { Emit } from "../events";
import { fail, ok, type Result } from "../result";
import type { GameState } from "../state/gameState";
import type { Command } from "./command";

/**
 * A queued command, or an undo. An undo takes its inverse from the stack only
 * when it is applied, so it undoes whatever was applied just before it,
 * including commands queued in the same tick.
 */
type Queued = Command | "undo";

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
    const result = command.validate(state);
    if (result.ok) this.queued.push(command);
    return result;
  }

  /**
   * Queues a command from a replay log. It skips dispatch-time validation,
   * which cannot see the commands queued before it, and is revalidated when
   * applied like any other.
   */
  replay(command: Command): void {
    this.queued.push(command);
  }

  /** Queues an undo of the latest applied command. */
  undo(state: Readonly<GameState>): Result {
    if (this.queued.length === 0) {
      // Nothing pending, so the inverse can be checked now for feedback.
      const inverse = this.undoStack.at(-1);
      if (!inverse) return fail("nothing_to_undo");
      const result = inverse.validate(state);
      if (!result.ok) return result;
    } else if (this.undoable() <= 0) {
      return fail("nothing_to_undo");
    }
    this.queued.push("undo");
    return ok();
  }

  get undoDepth(): number {
    return this.undoStack.length;
  }

  /**
   * Applies everything queued. A command that no longer validates is dropped;
   * an undo that no longer validates keeps its inverse on the stack.
   */
  applyQueued(state: GameState, emit: Emit): void {
    const queued = this.queued;
    this.queued = [];
    for (const entry of queued) {
      const undo = entry === "undo";
      const command = undo ? this.undoStack.pop() : entry;
      if (!command) {
        emit({
          type: "CommandRejected",
          command: "Undo",
          reason: "nothing_to_undo",
        });
        continue;
      }
      const result = command.validate(state);
      if (!result.ok) {
        if (undo) this.undoStack.push(command);
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

  /** How many undos the stack can serve once the queue is applied. */
  private undoable(): number {
    let depth = this.undoStack.length;
    for (const entry of this.queued) {
      depth = entry === "undo" ? depth - 1 : Math.min(depth + 1, UNDO_DEPTH);
    }
    return depth;
  }
}
