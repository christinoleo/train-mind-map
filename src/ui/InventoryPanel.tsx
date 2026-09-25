import type { ReadonlySignal, Signal } from "@preact/signals";
import { useEffect, useState } from "preact/hooks";
import {
  ITEM_CATEGORIES,
  ITEM_CATEGORY,
  ITEMS,
  itemEntries,
  type ItemId,
} from "../data/items";
import type { StorageKind } from "../data/nodes";
import {
  cssColor,
  GLYPH_POLYS,
  GLYPH_SQUARE_HALF,
  ITEM_STYLE,
} from "../render/theme";
import type { GameState } from "../sim/state/gameState";
import type { NodeId } from "../sim/state/ids";
import {
  buildsFrom,
  constructionStock,
  isStorage,
  storedItems,
} from "../sim/state/stock";
import { formatAmount } from "./format";
import { Menu } from "./Menu";
import { strings } from "./strings";

/** One storage node's share of an item. */
export interface StorageShare {
  id: NodeId;
  kind: StorageKind;
  /** The Box's number, counted by id from 1; 0 for the Core. */
  number: number;
  count: number;
  /** True for a Box kept out of construction (FR71). */
  kept: boolean;
}

/** What the inventory panel shows, published by the UI bridge. */
export interface InventoryInfo {
  /** Items held by the storage construction draws from, without limit. */
  used: number;
  /** The items in stock, raw first, then smelted, intermediate and science. */
  slots: { item: ItemId; count: number; storages: StorageShare[] }[];
}

/** Slot order: by category, then in the order the game lists the items. */
const SLOT_ORDER = [...ITEMS].sort(
  (a, b) =>
    ITEM_CATEGORIES.indexOf(ITEM_CATEGORY[a]) -
      ITEM_CATEGORIES.indexOf(ITEM_CATEGORY[b]) ||
    ITEMS.indexOf(a) - ITEMS.indexOf(b),
);

/**
 * The global stock slot by slot, with the storage nodes holding each item,
 * and the fill of the storage construction draws from (FR68, ADR-0006).
 */
export function inventoryInfo(state: Readonly<GameState>): InventoryInfo {
  const shares = new Map<ItemId, StorageShare[]>();
  let boxes = 0;
  const storages = [...state.nodes.values()]
    .filter(isStorage)
    .sort((a, b) => a.id - b.id);
  for (const node of storages) {
    const number = node.kind === "box" ? ++boxes : 0;
    const kept = !buildsFrom(node);
    for (const [item, count] of itemEntries(storedItems(node))) {
      const list = shares.get(item) ?? [];
      list.push({ id: node.id, kind: node.kind, number, count, kept });
      shares.set(item, list);
    }
  }
  const slots = SLOT_ORDER.flatMap((item) => {
    const list = shares.get(item);
    if (!list) return [];
    const count = list.reduce((sum, share) => sum + share.count, 0);
    return [{ item, count, storages: list }];
  });
  return { used: constructionStock(state), slots };
}

interface Props {
  inventory: ReadonlySignal<InventoryInfo>;
  /** True while the panel is open; it shares the menus' place on screen. */
  open: Signal<boolean>;
  /** Takes the camera to a storage node. */
  onShowStorage(id: NodeId): void;
}

/**
 * The inventory (FR68): the global stock as a grid of slots, the fill of
 * the storage construction draws from, and, for the slot tapped, the
 * storage nodes that hold its item. Tapping outside or Esc closes it.
 */
export function InventoryPanel(props: Props) {
  return props.open.value ? <InventoryBody {...props} /> : null;
}

/** The open panel; closing unmounts it, which forgets the slot tapped. */
function InventoryBody({ inventory, open, onShowStorage }: Props) {
  const text = strings.inventory;
  const [picked, setPicked] = useState<ItemId | null>(null);
  const close = () => (open.value = false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") open.value = false;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  const { used, slots } = inventory.value;
  const slot = slots.find((s) => s.item === picked);
  return (
    <>
      <div class="inventory-backdrop" aria-hidden="true" onClick={close} />
      <Menu
        label={text.title}
        title={text.title}
        onClose={close}
        class="inventory"
      >
        <p class="inventory-capacity">
          <span>{text.capacity}</span>
          <span>
            {formatAmount(used)}/{formatAmount(Infinity)}
          </span>
        </p>
        {slots.length === 0 ? (
          <p class="menu-note">{strings.hud.emptyStock}</p>
        ) : (
          <ul class="inventory-grid">
            {slots.map(({ item, count }) => {
              const label = `${strings.items[item]}: ${count}`;
              return (
                <li key={item}>
                  <button
                    type="button"
                    class="menu-action inventory-slot"
                    aria-pressed={item === picked}
                    aria-label={label}
                    title={label}
                    onClick={() => setPicked(item === picked ? null : item)}
                  >
                    <ItemIcon item={item} />
                    <span class="inventory-count">{formatAmount(count)}</span>
                    <span class="inventory-name">{strings.items[item]}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {slot && (
          <div class="inventory-storages">
            <span class="menu-items">
              {strings.items[slot.item]} {text.heldIn}
            </span>
            {slot.storages.map((share) => (
              <button
                key={share.id}
                type="button"
                class="menu-action inventory-storage"
                onClick={() => onShowStorage(share.id)}
              >
                <span>
                  {strings.nodes[share.kind]}
                  {share.number > 0 && ` ${share.number}`}
                  {share.kept && <span class="menu-items"> · {text.kept}</span>}
                </span>
                <span class="inventory-share">{formatAmount(share.count)}</span>
              </button>
            ))}
          </div>
        )}
      </Menu>
    </>
  );
}

/** An item's glyph in its colour, as on the map (FR150). */
export function ItemIcon({ item }: { item: ItemId }) {
  const { color, shape } = ITEM_STYLE[item];
  const props = {
    fill: cssColor(color),
    stroke: "#13161c",
    "stroke-width": 0.12,
  };
  const h = GLYPH_SQUARE_HALF;
  return (
    <svg class="item-icon" viewBox="-1.3 -1.3 2.6 2.6" aria-hidden="true">
      {shape === "circle" ? (
        <circle r={1} {...props} />
      ) : shape === "square" ? (
        <rect x={-h} y={-h} width={2 * h} height={2 * h} {...props} />
      ) : (
        <polygon points={GLYPH_POLYS[shape].join(" ")} {...props} />
      )}
    </svg>
  );
}
