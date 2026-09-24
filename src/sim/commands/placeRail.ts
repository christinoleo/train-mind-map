import type { Emit } from "../events";
import { fail, ok, type Result } from "../result";
import { planRail } from "../rail/rails";
import type { GameState, RailEnd } from "../state/gameState";
import { pathBounds } from "../state/edges";
import { allocateId, type RailId } from "../state/ids";
import { debit } from "../state/stock";
import type { Command } from "./command";
import { RemoveRail } from "./removeRail";

/**
 * Builds a double-track rail from one Station rail port to another along its
 * automatic route, paid per cell from the global stock (FR45, FR79–FR81).
 * One rail fits per rail port.
 */
export class PlaceRail implements Command {
  readonly type = "PlaceRail";
  private built?: RailId;

  constructor(
    readonly from: RailEnd,
    readonly to: RailEnd,
  ) {}

  validate(state: Readonly<GameState>): Result {
    const { check } = planRail(state, this.from, this.to);
    return check.ok ? ok() : fail(check.reason);
  }

  apply(state: GameState, emit: Emit) {
    const { route, check } = planRail(state, this.from, this.to);
    if (!route || !check.ok) {
      throw new Error("PlaceRail applied without validating");
    }
    const id = allocateId(state.nextIds, "rail");
    const site = pathBounds(route.path);
    const draws = debit(state, check.value, site);
    state.rails.set(id, {
      id,
      from: { ...this.from },
      to: { ...this.to },
      path: route.path,
    });
    this.built = id;
    emit({ type: "ConstructionPaid", site, draws });
  }

  invert(): Command {
    if (this.built === undefined) throw new Error("PlaceRail was not applied");
    return new RemoveRail(this.built);
  }
}
