import { addCounts, type ItemCounts } from "../../data/items";
import type { Emit } from "../events";
import { fail, ok, type Result } from "../result";
import type { GameState, Line } from "../state/gameState";
import type { LineId } from "../state/ids";
import { canAfford } from "../state/stock";
import { lineTrains } from "../rail/lines";
import type { Command } from "./command";
import { RemoveTrain, RestoreTrain } from "./removeTrain";

/**
 * Removes a Line and takes its trains off the rails, each refunded as
 * `RemoveTrain` does. Its Stations are then free to remove.
 */
export class RemoveLine implements Command {
  readonly type = "RemoveLine";
  private removed?: { line: Line; trains: RestoreTrain[] };

  constructor(readonly id: LineId) {}

  validate(state: Readonly<GameState>): Result {
    return state.lines.has(this.id) ? ok() : fail("not_found");
  }

  apply(state: GameState) {
    const line = state.lines.get(this.id)!;
    const trains = lineTrains(state, this.id).map((t) => {
      const remove = new RemoveTrain(t.id);
      remove.apply(state);
      return remove.invert() as RestoreTrain;
    });
    state.lines.delete(this.id);
    this.removed = { line: structuredClone(line), trains };
  }

  invert(): Command {
    if (!this.removed) throw new Error("RemoveLine was not applied");
    return new RestoreLine(this.removed.line, this.removed.trains);
  }
}

/** Puts a removed Line back with its trains, as the undo of `RemoveLine`. */
class RestoreLine implements Command {
  readonly type = "RestoreLine";

  constructor(
    private readonly line: Line,
    private readonly trains: readonly RestoreTrain[],
  ) {}

  validate(state: Readonly<GameState>): Result {
    if (state.lines.has(this.line.id)) return fail("occupied");
    if (this.line.stops.some((s) => !state.nodes.has(s.station))) {
      return fail("not_found");
    }
    const withLine = {
      ...state,
      lines: new Map(state.lines).set(this.line.id, this.line),
    };
    const refunds: ItemCounts = {};
    for (const train of this.trains) {
      const check = train.validate(withLine, false);
      if (!check.ok) return check;
      addCounts(refunds, train.refunded);
    }
    return canAfford(state, refunds) ? ok() : fail("no_stock");
  }

  apply(state: GameState, emit: Emit) {
    state.lines.set(this.line.id, structuredClone(this.line));
    for (const train of this.trains) train.apply(state, emit);
  }

  invert(): Command {
    return new RemoveLine(this.line.id);
  }
}
