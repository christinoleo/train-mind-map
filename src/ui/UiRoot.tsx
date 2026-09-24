import type { ReadonlySignal } from "@preact/signals";
import type { ComponentProps } from "preact";
import type { ItemCounts } from "../data/items";
import { Palette } from "./Palette";
import { StockHud } from "./StockHud";

type Props = ComponentProps<typeof Palette> & {
  /** The global stock, published by the UI bridge. */
  stock: ReadonlySignal<ItemCounts>;
  /** The stamina points left. */
  stamina: ReadonlySignal<number>;
};

// The DOM overlay layer above the canvas: the HUD capsule and the palette now,
// menus in later tasks.
export function UiRoot({ stock, stamina, ...palette }: Props) {
  return (
    <>
      <StockHud stock={stock} stamina={stamina} />
      <Palette {...palette} />
    </>
  );
}
