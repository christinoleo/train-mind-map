import type { ReadonlySignal } from "@preact/signals";
import { ITEMS, type ItemCounts } from "../data/items";
import { cssColor, ITEM_COLOR } from "../render/theme";
import { formatCount } from "./format";
import { strings } from "./strings";

/**
 * The HUD capsule at the top of the screen (GDD §HUD): one chip per item in
 * the global stock, a colour swatch and the count in K/M notation (FR68).
 * The item's name and exact count are in the chip's label.
 */
export function StockHud({ stock }: { stock: ReadonlySignal<ItemCounts> }) {
  const text = strings.hud;
  const held = ITEMS.filter((item) => (stock.value[item] ?? 0) > 0);
  return (
    <div class="hud">
      <ul class="stock" aria-label={text.stock}>
        {held.length === 0 ? (
          <li class="stock-empty">{text.emptyStock}</li>
        ) : (
          held.map((item) => {
            const count = stock.value[item]!;
            const label = `${strings.items[item]}: ${count}`;
            return (
              <li
                key={item}
                class="stock-chip"
                title={label}
                aria-label={label}
              >
                <span
                  class="stock-swatch"
                  style={{ background: cssColor(ITEM_COLOR[item]) }}
                />
                {formatCount(count)}
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
