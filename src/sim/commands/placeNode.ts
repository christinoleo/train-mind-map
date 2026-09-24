import type { RawResource } from "../../data/items";
import type { NodeKind } from "../../data/nodes";
import { fail, ok, type Result } from "../result";
import type { FactoryNode, GameState } from "../state/gameState";
import { allocateId, type NodeId } from "../state/ids";
import { checkFootprint, isUnlocked } from "../state/nodes";
import type { Command } from "./command";
import { RemoveNode } from "./removeNode";

/**
 * Checks that the player may place a node of `kind` with its top-left cell
 * at (x, y): the kind is unlocked and the footprint fits. On success it
 * returns the resource under an Extractor.
 */
export function checkPlacement(
  state: Readonly<GameState>,
  kind: NodeKind,
  x: number,
  y: number,
): Result<RawResource | undefined> {
  if (!isUnlocked(state, kind)) return fail("locked");
  return checkFootprint(state, kind, x, y);
}

/** Places a node of `kind` with its top-left cell at (x, y) (FR16–FR18). */
export class PlaceNode implements Command {
  readonly type = "PlaceNode";
  private placed?: NodeId;

  constructor(
    readonly kind: NodeKind,
    readonly x: number,
    readonly y: number,
  ) {}

  validate(state: Readonly<GameState>): Result {
    const fits = checkPlacement(state, this.kind, this.x, this.y);
    return fits.ok ? ok() : fail(fits.reason);
  }

  apply(state: GameState) {
    const fits = checkFootprint(state, this.kind, this.x, this.y);
    if (!fits.ok) throw new Error("PlaceNode applied without validating");
    const id = allocateId(state.nextIds, "node");
    const base = { id, x: this.x, y: this.y };
    const node: FactoryNode =
      this.kind === "extractor"
        ? { ...base, kind: this.kind, resource: fits.value! }
        : { ...base, kind: this.kind };
    state.nodes.set(id, node);
    this.placed = id;
  }

  invert(): Command {
    if (this.placed === undefined) throw new Error("PlaceNode was not applied");
    return new RemoveNode(this.placed);
  }
}
