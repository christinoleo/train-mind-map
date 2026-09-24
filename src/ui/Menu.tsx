import type { ComponentChildren } from "preact";
import { itemEntries } from "../data/items";
import type { Cost } from "../data/nodes";
import type { FailReason } from "../sim/result";
import { strings } from "./strings";

interface Props {
  /** What the menu is about, for screen readers. */
  label: string;
  /** The header line. */
  title: ComponentChildren;
  onClose(): void;
  children: ComponentChildren;
}

/**
 * A context menu over the bottom of the screen, opened by tapping something
 * on the map: a header with a close button, then its actions.
 */
export function Menu({ label, title, onClose, children }: Props) {
  return (
    <div class="menu" role="dialog" aria-label={label}>
      <header class="menu-head">
        <span>{title}</span>
        <button
          type="button"
          class="menu-close"
          aria-label={strings.menu.close}
          onClick={onClose}
        >
          {strings.menu.closeGlyph}
        </button>
      </header>
      {children}
    </div>
  );
}

/** A cost or a refund, as "4 minério de ferro, 2 engrenagem". */
export function Items({ cost }: { cost: Cost }) {
  return (
    <span class="menu-items">
      {itemEntries(cost)
        .map(([item, count]) => `${count} ${strings.items[item]}`)
        .join(", ")}
    </span>
  );
}

/** An upgrade: what it raises to, what it costs, and why it is refused. */
export function UpgradeAction({
  label,
  cost,
  refused,
  onClick,
}: {
  label: ComponentChildren;
  cost: Cost;
  refused: FailReason | null;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      class="menu-action"
      disabled={refused !== null}
      onClick={onClick}
    >
      <span>{label}</span>
      <Items cost={cost} />
      {refused && <span class="menu-refused">{strings.reasons[refused]}</span>}
    </button>
  );
}

/** Removal, with what it gives back. */
export function RemoveAction({
  refund,
  onClick,
}: {
  refund: Cost;
  onClick(): void;
}) {
  return (
    <button type="button" class="menu-action menu-remove" onClick={onClick}>
      <span>{strings.menu.remove}</span>
      <span class="menu-items">
        {strings.menu.refund} <Items cost={refund} />
      </span>
    </button>
  );
}
