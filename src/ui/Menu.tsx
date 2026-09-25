import type { ComponentChildren } from "preact";
import { itemEntries } from "../data/items";
import type { Cost } from "../data/nodes";
import { formatAmount } from "./format";
import { strings } from "./strings";

interface Props {
  /** What the menu is about, for screen readers. */
  label: string;
  /** The header line. */
  title: ComponentChildren;
  onClose(): void;
  children: ComponentChildren;
  /** An extra class for a menu with its own layout. */
  class?: string;
}

/**
 * A context menu over the bottom of the screen, opened by tapping something
 * on the map: a header with a close button, then its actions.
 */
export function Menu({ label, title, onClose, children, class: extra }: Props) {
  return (
    <div
      class={extra ? `menu ${extra}` : "menu"}
      role="dialog"
      aria-label={label}
    >
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
        .map(([item, count]) => `${formatAmount(count)} ${strings.items[item]}`)
        .join(", ")}
    </span>
  );
}

/** Removal, with what it gives back. */
export function RemoveAction({
  label = strings.menu.remove,
  refund,
  onClick,
}: {
  label?: ComponentChildren;
  refund: Cost;
  onClick(): void;
}) {
  return (
    <button type="button" class="menu-action menu-remove" onClick={onClick}>
      <span>{label}</span>
      <span class="menu-items">
        {strings.menu.refund} <Items cost={refund} />
      </span>
    </button>
  );
}
