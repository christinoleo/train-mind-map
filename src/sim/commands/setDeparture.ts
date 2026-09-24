import { DEPARTURE_KINDS, type DepartureCondition } from "../../data/rail";
import { fail, ok, type Result } from "../result";
import type { GameState } from "../state/gameState";
import type { LineId } from "../state/ids";
import type { Command } from "./command";

/** Sets the departure condition of stop `stop` of `line` (FR96). */
export class SetDeparture implements Command {
  readonly type = "SetDeparture";
  private previous?: DepartureCondition;

  constructor(
    readonly line: LineId,
    readonly stop: number,
    readonly condition: DepartureCondition,
  ) {}

  validate(state: Readonly<GameState>): Result {
    const stop = state.lines.get(this.line)?.stops[this.stop];
    if (!stop) return fail("not_found");
    const { kind, seconds } = this.condition;
    if (!DEPARTURE_KINDS.includes(kind) || !(seconds >= 0)) {
      return fail("not_found");
    }
    return ok();
  }

  apply(state: GameState) {
    const stop = state.lines.get(this.line)!.stops[this.stop];
    this.previous = stop.condition;
    stop.condition = { ...this.condition };
  }

  invert(): Command {
    if (!this.previous) throw new Error("SetDeparture was not applied");
    return new SetDeparture(this.line, this.stop, this.previous);
  }
}
