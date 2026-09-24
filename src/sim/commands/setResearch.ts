import type { ResearchId } from "../../data/research";
import { fail, ok, type Result } from "../result";
import type { GameState } from "../state/gameState";
import { researchStatus } from "../state/research";
import type { Command } from "./command";

/**
 * Chooses the research the Labs work on (FR109), or none with `null`. A
 * research must be open: not done, with every research it requires done.
 * Switching keeps the packs already spent on the one left, and a pack under
 * way still counts for the research it was taken for. It is a session
 * choice, not construction, so it has no undo.
 */
export class SetResearch implements Command {
  readonly type = "SetResearch";

  constructor(readonly research: ResearchId | null) {}

  validate(state: Readonly<GameState>): Result {
    if (this.research === null) return ok();
    switch (researchStatus(state, this.research)) {
      case "done":
        return fail("researched");
      case "locked":
        return fail("locked");
      default:
        return ok();
    }
  }

  apply(state: GameState) {
    state.research.active = this.research;
  }
}
