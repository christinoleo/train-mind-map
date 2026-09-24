import type { ReadonlySignal } from "@preact/signals";
import type { ComponentProps } from "preact";
import type { ItemCounts } from "../data/items";
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
};

// The DOM overlay layer above the canvas: the HUD capsule and the palette now,
// menus in later tasks.
export function UiRoot({ stock, stamina, edgeMenu, ...palette }: Props) {
  return (
    <>
      <StockHud stock={stock} stamina={stamina} />
      <EdgeMenu {...edgeMenu} />
      <Palette {...palette} />
    </>
  );
}
