import type { ReadonlySignal } from "@preact/signals";
import { ITEMS, type ItemCounts } from "../data/items";
import { STAMINA } from "../data/tap";
import type { PowerSummary } from "../sim/state/power";
import { cssColor, ITEM_COLOR } from "../render/theme";
import { formatCount } from "./format";
import { strings } from "./strings";

interface Props {
  stock: ReadonlySignal<ItemCounts>;
  stamina: ReadonlySignal<number>;
  power: ReadonlySignal<PowerSummary>;
  /** True while the Core and every Box are full (FR73). */
  storageFull: ReadonlySignal<boolean>;
}

/**
 * The HUD capsule at the top of the screen (GDD §HUD): one chip per item in
 * the global stock, a colour swatch and the count in K/M notation (FR68),
 * over the ⚡ meter (FR131) and the stamina bar (FR75), and a warning while
 * all storage is full and the factory has stopped (FR73). The item's name and
 * exact count are in the chip's label.
 */
export function StockHud({ stock, stamina, power, storageFull }: Props) {
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
        <PowerMeter power={power} />
        <StaminaBar stamina={stamina} />
        {storageFull.value && (
          <p class="stock-full" role="status">
            {text.storageFull}
          </p>
        )}
      </div>
    </div>
  );
}

/** Its own component so a tap re-renders only the bar, not the chips. */
function StaminaBar({ stamina }: { stamina: ReadonlySignal<number> }) {
  const text = strings.hud;
  const points = stamina.value;
  const label = `${text.stamina}: ${points}/${STAMINA.max}`;
  return (
    <div
      class="stamina"
      role="meter"
      aria-label={text.stamina}
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

/**
 * The ⚡ meter: the power drawn over the power supplied, as a bar and as
 * numbers, red while any mesh is short (FR65).
 */
function PowerMeter({ power }: { power: ReadonlySignal<PowerSummary> }) {
  const text = strings.hud;
  const { supply, demand, short } = power.value;
  const numbers = `${formatCount(demand)}/${formatCount(supply)}`;
  const label = `${text.power}: ${text.powerUse} ${numbers}${short ? ` (${text.powerShort})` : ""}`;
  // With no supply, any demand fills the bar: x / 0 is Infinity.
  const load = demand === 0 ? 0 : Math.min(1, demand / supply);
  return (
    <div class="power" title={label} data-short={short}>
      <span class="power-glyph" aria-hidden="true">
        {text.powerGlyph}
      </span>
      <div
        class="power-bar"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={supply}
        aria-valuenow={Math.min(demand, supply)}
      >
        <div class="power-fill" style={{ width: `${load * 100}%` }} />
      </div>
      <span class="power-numbers">{numbers}</span>
    </div>
  );
}
