import type { Command } from "../sim/commands/command";
import { fail, ok } from "../sim/result";
import type { GameState } from "../sim/state/gameState";
import { cellRing } from "../sim/state/map";

/** The outermost ring of the map: the one its corner cell belongs to. */
export const MAX_RING = cellRing(0, 0);

/** Superadmin cheat: sets the outermost revealed ring. Its inverse restores the old one. */
export class SetRevealedRing implements Command {
  readonly type = "SetRevealedRing";
  private previous?: number;

  constructor(private readonly ring: number) {}

  validate() {
    return Number.isInteger(this.ring) &&
      this.ring >= 0 &&
      this.ring <= MAX_RING
      ? ok()
      : fail("out_of_range");
  }

  apply(state: GameState) {
    this.previous = state.map.revealedRing;
    state.map.revealedRing = this.ring;
  }

  invert(): Command {
    if (this.previous === undefined) {
      throw new Error("SetRevealedRing was not applied");
    }
    return new SetRevealedRing(this.previous);
  }
}
