import type { ReadonlySignal } from "@preact/signals";
import type { ComponentProps } from "preact";
import type { ItemCounts } from "../data/items";
import type { PowerSummary } from "../sim/state/power";
import { EdgeMenu } from "./EdgeMenu";
import { Palette } from "./Palette";
import { StockHud } from "./StockHud";

type Props = ComponentProps<typeof Palette> & {
  /** The edge menu, open while an edge is selected. */
  edgeMenu: ComponentProps<typeof EdgeMenu>;
  /** The global stock, published by the UI bridge. */
  stock: ReadonlySignal<ItemCounts>;
  /** The stamina points left. */
  stamina: ReadonlySignal<number>;
  /** The ⚡ supplied and drawn, over every mesh. */
  power: ReadonlySignal<PowerSummary>;
};

// The DOM overlay layer above the canvas: the HUD capsule and the palette now,
// menus in later tasks.
export function UiRoot({ stock, stamina, power, edgeMenu, ...palette }: Props) {
  return (
    <>
      <StockHud stock={stock} stamina={stamina} power={power} />
      <EdgeMenu {...edgeMenu} />
      <Palette {...palette} />
    </>
  );
}
