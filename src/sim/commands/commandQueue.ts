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
export type Queued = Command | "undo";

/** An entry of the replay log: a command or an undo, and the tick it applied at. */
export type ReplayEntry = [tick: number, entry: Queued];

/**
 * The single entry point for state changes. Commands are validated when
 * dispatched, queued, and applied at the start of the next tick in arrival
 * order, each revalidated first.
 */
export class CommandQueue {
  private queued: Queued[] = [];
  private undoStack: Command[] = [];
  /** Replay entries waiting for their tick, in order. */
  private scheduled: ReplayEntry[] = [];
  /**
   * Every command and undo applied, with the tick it was applied at, in
   * order. An undo is logged as such, not as the inverse it applied: replayed
   * from the start, it undoes the same command again.
   */
  readonly replayLog: ReplayEntry[] = [];

  dispatch(state: Readonly<GameState>, command: Command): Result {
    const result = command.validate(state);
    if (result.ok) this.queued.push(command);
    return result;
  }

  /**
   * Queues a replay log: each entry joins the queue when the tick it was
   * logged at comes, so a replay from the same start reproduces the game.
   */
  schedule(log: readonly ReplayEntry[]): void {
    this.scheduled.push(...log);
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

  /**
   * Drops the queue, the scheduled replay, the undo stack and the replay
   * log, for a new game.
   */
  clear(): void {
    this.queued = [];
    this.scheduled = [];
    this.undoStack = [];
    this.replayLog.length = 0;
  }

  get undoDepth(): number {
    return this.undoStack.length;
  }

  /**
   * Applies everything queued. A command that no longer validates is dropped;
   * an undo that no longer validates keeps its inverse on the stack.
   */
  applyQueued(state: GameState, emit: Emit): void {
    let queued = this.queued;
    if (this.scheduled.length > 0) {
      const later = this.scheduled.findIndex(([at]) => at > state.tick);
      const due = this.scheduled.splice(0, later < 0 ? Infinity : later);
      queued = [...due.map(([, entry]) => entry), ...queued];
    }
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
          command: undo ? "Undo" : command.type,
          reason: result.reason,
        });
        continue;
      }
      command.apply(state, emit);
      this.replayLog.push([state.tick, undo ? "undo" : command]);
      if (undo || !command.invert) continue;
      this.undoStack.push(command.invert());
      if (this.undoStack.length > UNDO_DEPTH) this.undoStack.shift();
    }
  }

  /** How many undos the stack can serve once the queue is applied. */
  private undoable(): number {
    let depth = this.undoStack.length;
    for (const entry of this.queued) {
      if (entry === "undo") depth--;
      else if (entry.invert) depth = Math.min(depth + 1, UNDO_DEPTH);
    }
    return depth;
  }
}
