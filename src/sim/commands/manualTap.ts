import type { RawResource } from "../../data/items";
import { TAPPABLE } from "../../data/tap";
import type { Emit } from "../events";
import { fail, ok, type Result } from "../result";
import type { GameState } from "../state/gameState";
import { depositUnder, isRevealedRect } from "../state/map";
import { isOccupied } from "../state/nodes";
import { tapYield } from "../state/stamina";
import { coreNode, storageRoom, store } from "../state/stock";
import type { Rect } from "../geometry/rect";
import type { Command } from "./command";

/**
 * A manual tap on cell (x, y) of a deposit: it spends 1 point of stamina
 * and sends the tap's yield of the deposit's resource to the Core (FR74,
 * FR75). Crude oil cannot be tapped, nor a deposit under a node. A tap is
 * not undoable.
 */
export class ManualTap implements Command {
  readonly type = "ManualTap";

  constructor(
    readonly x: number,
    readonly y: number,
  ) {}

  validate(state: Readonly<GameState>): Result {
    const tapped = this.resource(state);
    if (!tapped.ok) return tapped;
    if (state.stamina.points < 1) return fail("no_stamina");
    return storageRoom(state, coreNode(state)) > 0
      ? ok()
      : fail("storage_full");
  }

  apply(state: GameState, emit: Emit) {
    const tapped = this.resource(state);
    if (!tapped.ok) throw new Error("ManualTap applied without validating");
    const item = tapped.value;
    const core = coreNode(state);
    // A Core with less room than the yield takes what fits.
    const count = Math.min(tapYield(state), storageRoom(state, core));
    state.stamina.points--;
    store(core, item, count);
    const { x, y } = this;
    emit({ type: "ManualTapped", x, y, item, count, core: core.id });
  }

  /** The resource under the tapped cell, if a tap may draw from it. */
  private resource(state: Readonly<GameState>): Result<RawResource> {
    const { map } = state;
    const cell: Rect = { x: this.x, y: this.y, w: 1, h: 1 };
    const deposit = isRevealedRect(map, cell)
      ? depositUnder(map, cell)
      : undefined;
    if (!deposit) return fail("needs_deposit");
    if (isOccupied(state, cell)) return fail("occupied");
    if (!TAPPABLE.includes(deposit.resource)) return fail("not_tappable");
    return ok(deposit.resource);
  }
}
