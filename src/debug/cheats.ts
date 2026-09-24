import { ITEMS, type ItemCounts } from "../data/items";
import type { Command } from "../sim/commands/command";
import { fail, ok } from "../sim/result";
import type { GameState, ItemRun } from "../sim/state/gameState";
import type { NodeId } from "../sim/state/ids";
import { cellRing } from "../sim/state/map";
import { deposit, isStorage } from "../sim/state/stock";

/** The outermost ring of the map: the one its corner cell belongs to. */
export const MAX_RING = cellRing(0, 0);

/** Superadmin cheat: sets the outermost revealed ring. Its inverse restores the old one. */
export class SetRevealedRing implements Command {
  readonly type = "SetRevealedRing";
  private previous?: number;

  constructor(readonly ring: number) {}

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

/** What every storage node holds, by id. */
type StorageContents = Map<NodeId, ItemRun[]>;

function storageContents(state: GameState): StorageContents {
  const contents: StorageContents = new Map();
  for (const node of state.nodes.values()) {
    if (isStorage(node)) contents.set(node.id, structuredClone(node.items));
  }
  return contents;
}

/**
 * Superadmin cheat: puts `perItem` of every item into storage, nearest the
 * Core first, up to capacity. Its inverse puts the old contents back.
 */
export class GiveItems implements Command {
  readonly type = "GiveItems";
  private previous?: StorageContents;

  constructor(readonly perItem: number) {}

  validate() {
    return Number.isInteger(this.perItem) && this.perItem > 0
      ? ok()
      : fail("out_of_range");
  }

  apply(state: GameState) {
    this.previous = storageContents(state);
    const items: ItemCounts = {};
    for (const item of ITEMS) items[item] = this.perItem;
    deposit(state, items, state.map.core);
  }

  invert(): Command {
    if (!this.previous) throw new Error("GiveItems was not applied");
    return new SetStorageContents(this.previous);
  }
}

/** Sets what storage nodes hold, as the undo of `GiveItems`. */
class SetStorageContents implements Command {
  readonly type = "SetStorageContents";
  private previous?: StorageContents;

  constructor(private readonly contents: StorageContents) {}

  validate() {
    return ok();
  }

  apply(state: GameState) {
    this.previous = storageContents(state);
    for (const [id, items] of this.contents) {
      const node = state.nodes.get(id);
      if (node && isStorage(node)) node.items = structuredClone(items);
    }
  }

  invert(): Command {
    if (!this.previous) throw new Error("SetStorageContents was not applied");
    return new SetStorageContents(this.previous);
  }
}
