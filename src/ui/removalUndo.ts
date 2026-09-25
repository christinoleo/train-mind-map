import { computed, signal } from "@preact/signals";
import { REMOVED_TOAST_MS } from "../config/constants";
import type { Command } from "../sim/commands/command";
import type { CommandQueue } from "../sim/commands/commandQueue";
import type { Result } from "../sim/result";
import type { GameState } from "../sim/state/gameState";

/**
 * The "Removido · Desfazer" toast after a removal from the action bubble
 * (FR19, FR59): for `REMOVED_TOAST_MS` its button undoes that removal. It
 * goes early once the removal is no longer the last thing undo would take
 * back, or when the simulation refused it, so it never undoes anything else.
 */
export class RemovalUndo {
  private readonly removal = signal<{ command: Command; until: number } | null>(
    null,
  );
  /** True while the toast shows. */
  readonly shown = computed(() => this.removal.value !== null);

  constructor(private readonly commands: CommandQueue) {}

  /** A removal was dispatched at `now`, in ms. */
  removed(command: Command, now: number) {
    this.removal.value = { command, until: now + REMOVED_TOAST_MS };
  }

  /** Runs after each tick: the toast goes once its time is up or its removal is out of reach. */
  update(now: number) {
    const removal = this.removal.peek();
    if (removal && (now >= removal.until || !this.undoable(removal.command))) {
      this.hide();
    }
  }

  /** Undoes the removal, and the toast goes. */
  undo(state: Readonly<GameState>): Result | null {
    const removal = this.removal.peek();
    // A removal not applied yet keeps its toast; `update` drops a stale one.
    if (!removal || !this.undoable(removal.command)) return null;
    this.hide();
    return this.commands.undo(state);
  }

  private hide() {
    this.removal.value = null;
  }

  /**
   * True when `command` was applied and nothing undoable has been applied or
   * undone since. Called after each tick, a removal not in the log was
   * refused: dispatch queues it for the very next tick.
   */
  private undoable(command: Command): boolean {
    const log = this.commands.replayLog;
    for (let i = log.length - 1; i >= 0; i--) {
      const entry = log[i][1];
      if (entry === command) return true;
      if (entry === "undo" || entry.invert) return false;
    }
    return false;
  }
}
