import type { ReadonlySignal, Signal } from "@preact/signals";
import { useState } from "preact/hooks";
import { ITEMS, type ItemCounts, type ItemId } from "../data/items";
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
  /** True while the inventory panel is open; its button sits in the capsule. */
  inventoryOpen: Signal<boolean>;
}

/**
 * The HUD capsule at the top of the screen (GDD §HUD): one chip per item in
 * the global stock, over the ⚡ meter (FR131) and the stamina bar (FR75), and
 * a warning while all storage is full and the factory has stopped (FR73).
 * The button beside the chips opens the inventory.
 */
export function StockHud({
  stock,
  stamina,
  power,
  storageFull,
  inventoryOpen,
}: Props) {
  const text = strings.hud;
  const held = ITEMS.filter((item) => (stock.value[item] ?? 0) > 0);
  return (
    <div class="hud">
      <div class="hud-capsule">
        <div class="hud-row">
          <button
            type="button"
            class="inventory-toggle"
            aria-expanded={inventoryOpen.value}
            aria-label={strings.inventory.title}
            title={strings.inventory.title}
            onClick={() => (inventoryOpen.value = !inventoryOpen.value)}
          >
            {strings.inventory.glyph}
          </button>
          <ul class="stock" aria-label={text.stock}>
            {held.length === 0 ? (
              <li class="stock-empty">{text.emptyStock}</li>
            ) : (
              held.map((item) => (
                <StockChip key={item} item={item} count={stock.value[item]!} />
              ))
            )}
          </ul>
        </div>
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

/**
 * An item's chip: a colour swatch, the item's name and its count in K/M
 * notation (FR68, FR150). On a narrow screen the name shrinks to an
 * abbreviation, and a tap on the chip shows it in full until the next tap.
 * The exact count is in the chip's label.
 */
function StockChip({ item, count }: { item: ItemId; count: number }) {
  const [open, setOpen] = useState(false);
  const label = `${strings.items[item]}: ${count}`;
  return (
    <li>
      <button
        type="button"
        class="stock-chip"
        title={label}
        aria-label={label}
        data-open={open}
        onClick={() => setOpen(!open)}
      >
        <span
          class="stock-swatch"
          style={{ background: cssColor(ITEM_COLOR[item]) }}
        />
        <span class="stock-name">{strings.items[item]}</span>
        <span class="stock-abbr">
          {strings.itemsShort[item] ?? strings.items[item]}
        </span>
        {formatCount(count)}
      </button>
    </li>
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
