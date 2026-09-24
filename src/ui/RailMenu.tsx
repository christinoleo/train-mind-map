import type { ReadonlySignal } from "@preact/signals";
import type { Cost } from "../data/nodes";
import { railCost, railLength } from "../sim/rail/rails";
import type { GameState } from "../sim/state/gameState";
import type { RailId } from "../sim/state/ids";
import { Menu, RemoveAction } from "./Menu";
import { strings } from "./strings";

/** What the rail menu shows of the selected rail, published by the UI bridge. */
export interface RailMenuInfo {
  length: number;
  /** What removing the rail gives back. */
  refund: Cost;
}

/** What the menu shows of rail `id`, or `null` when there is no such rail. */
export function railMenuInfo(
  state: Readonly<GameState>,
  id: RailId,
): RailMenuInfo | null {
  const rail = state.rails.get(id);
  if (!rail) return null;
  const length = railLength(rail.path);
  return { length, refund: railCost(length) };
}

interface Props {
  rail: ReadonlySignal<RailMenuInfo | null>;
  onRemove(): void;
  onClose(): void;
}

/**
 * The rail menu, opened by tapping a rail on the rail layer: its length and
 * removal, which refunds the whole cost.
 */
export function RailMenu({ rail, onRemove, onClose }: Props) {
  const info = rail.value;
  if (!info) return null;
  const text = strings.rail;
  return (
    <Menu
      label={text.title}
      title={
        <>
          {text.title}
          {strings.menu.separator}
          {info.length} {text.length}
        </>
      }
      onClose={onClose}
    >
      <RemoveAction refund={info.refund} onClick={onRemove} />
    </Menu>
  );
}
