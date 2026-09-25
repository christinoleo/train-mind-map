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
import { cssColor, GLYPH_POLYS, ITEM_STYLE } from "../render/theme";
import type { GameState } from "../sim/state/gameState";
import type { NodeId } from "../sim/state/ids";
import {
  buildsFrom,
  isStorage,
  storageCapacity,
  storedCount,
  storedItems,
} from "../sim/state/stock";
import { formatCount } from "./format";
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
  /** Items held by the storage construction draws from. */
  used: number;
  /** What that storage holds at most. */
  capacity: number;
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
  let used = 0;
  let capacity = 0;
  let boxes = 0;
  const storages = [...state.nodes.values()]
    .filter(isStorage)
    .sort((a, b) => a.id - b.id);
  for (const node of storages) {
    const number = node.kind === "box" ? ++boxes : 0;
    const kept = !buildsFrom(node);
    if (!kept) {
      used += storedCount(node);
      capacity += storageCapacity(state, node);
    }
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
  return { used, capacity, slots };
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
export function InventoryPanel({ inventory, open, onShowStorage }: Props) {
  const text = strings.inventory;
  const [picked, setPicked] = useState<ItemId | null>(null);
  const isOpen = open.value;
  useEffect(() => {
    if (!isOpen) {
      setPicked(null);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") open.value = false;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, open]);
  if (!isOpen) return null;
  const { used, capacity, slots } = inventory.value;
  const slot = slots.find((s) => s.item === picked);
  const close = () => (open.value = false);
  return (
    <>
      <div class="inventory-backdrop" aria-hidden="true" onClick={close} />
      <div class="menu inventory" role="dialog" aria-label={text.title}>
        <header class="menu-head">
          <span>{text.title}</span>
          <button
            type="button"
            class="menu-close"
            aria-label={strings.menu.close}
            onClick={close}
          >
            {strings.menu.closeGlyph}
          </button>
        </header>
        <CapacityBar used={used} capacity={capacity} />
        {slots.length === 0 ? (
          <p class="menu-note">{strings.hud.emptyStock}</p>
        ) : (
          <ul class="inventory-grid">
            {slots.map(({ item, count }) => (
              <li key={item}>
                <button
                  type="button"
                  class="inventory-slot"
                  aria-pressed={item === picked}
                  aria-label={`${strings.items[item]}: ${count}`}
                  title={`${strings.items[item]}: ${count}`}
                  onClick={() => setPicked(item === picked ? null : item)}
                >
                  <ItemIcon item={item} />
                  <span class="inventory-count">{formatCount(count)}</span>
                  <span class="inventory-name">{strings.items[item]}</span>
                </button>
              </li>
            ))}
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
                <span class="inventory-share">{formatCount(share.count)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

/** The fill of the storage construction draws from, as a bar and numbers. */
function CapacityBar({ used, capacity }: { used: number; capacity: number }) {
  const text = strings.inventory;
  const numbers = `${formatCount(used)}/${formatCount(capacity)}`;
  const full = used >= capacity;
  return (
    <div class="inventory-capacity" data-full={full}>
      <span>{text.capacity}</span>
      <div
        class="inventory-bar"
        role="meter"
        aria-label={`${text.capacity}: ${used}/${capacity}`}
        aria-valuemin={0}
        aria-valuemax={capacity}
        aria-valuenow={used}
      >
        <div
          class="inventory-fill"
          style={{
            width: `${capacity === 0 ? 0 : Math.min(1, used / capacity) * 100}%`,
          }}
        />
      </div>
      <span class="inventory-numbers">{numbers}</span>
    </div>
  );
}

/** An item's glyph in its colour, as on the map (FR150). */
export function ItemIcon({ item }: { item: ItemId }) {
  const { color, shape } = ITEM_STYLE[item];
  const fill = cssColor(color);
  const props = { fill, stroke: "#13161c", "stroke-width": 0.12 };
  return (
    <svg class="item-icon" viewBox="-1.3 -1.3 2.6 2.6" aria-hidden="true">
      {shape === "circle" ? (
        <circle r={1} {...props} />
      ) : shape === "square" ? (
        <rect x={-0.85} y={-0.85} width={1.7} height={1.7} {...props} />
      ) : (
        <polygon points={GLYPH_POLYS[shape].join(" ")} {...props} />
      )}
    </svg>
  );
}
