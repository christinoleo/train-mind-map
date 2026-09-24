import type { ReadonlySignal } from "@preact/signals";
import { ITEMS, type ItemCounts } from "../data/items";
import { STAMINA } from "../data/tap";
import { cssColor, ITEM_COLOR } from "../render/theme";
import { formatCount } from "./format";
import { strings } from "./strings";

interface Props {
  stock: ReadonlySignal<ItemCounts>;
  stamina: ReadonlySignal<number>;
}

/**
 * The HUD capsule at the top of the screen (GDD §HUD): one chip per item in
 * the global stock, a colour swatch and the count in K/M notation (FR68),
 * over the stamina bar (FR75). The item's name and exact count are in the
 * chip's label.
 */
export function StockHud({ stock, stamina }: Props) {
  const text = strings.hud;
  const held = ITEMS.filter((item) => (stock.value[item] ?? 0) > 0);
  return (
    <div class="hud">
      <div class="hud-capsule">
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
        <StaminaBar stamina={stamina} />
      </div>
    </div>
  );
}

/** Its own component so a tap re-renders only the bar, not the chips. */
function StaminaBar({ stamina }: { stamina: ReadonlySignal<number> }) {
  const points = stamina.value;
  const label = `${strings.hud.stamina}: ${points}/${STAMINA.max}`;
  return (
    <div
      class="stamina"
      role="meter"
      aria-label={strings.hud.stamina}
      aria-valuemin={0}
      aria-valuemax={STAMINA.max}
      aria-valuenow={points}
      title={label}
      data-empty={points === 0}
    >
      <div
        class="stamina-fill"
        style={{ width: `${(points / STAMINA.max) * 100}%` }}
      />
    </div>
  );
}
