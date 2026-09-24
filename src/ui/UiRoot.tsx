import type { ReadonlySignal } from "@preact/signals";
import type { ComponentProps } from "preact";
import type { ItemCounts } from "../data/items";
import type { PowerSummary } from "../sim/state/power";
import { EdgeMenu } from "./EdgeMenu";
import { NodeMenu } from "./NodeMenu";
import { Palette } from "./Palette";
import { StockHud } from "./StockHud";
import { UndoButton } from "./UndoButton";

type Props = ComponentProps<typeof Palette> & {
  /** The edge menu, open while an edge is selected. */
  edgeMenu: ComponentProps<typeof EdgeMenu>;
  /** The node menu, open while a node is selected. */
  nodeMenu: ComponentProps<typeof NodeMenu>;
  undo: ComponentProps<typeof UndoButton>;
  /** The global stock, published by the UI bridge. */
  stock: ReadonlySignal<ItemCounts>;
  /** The stamina points left. */
  stamina: ReadonlySignal<number>;
  /** The ⚡ supplied and drawn, over every mesh. */
  power: ReadonlySignal<PowerSummary>;
  /** True while the Core and every Box are full. */
  storageFull: ReadonlySignal<boolean>;
};

// The DOM overlay layer above the canvas: the HUD capsule, the menus, the
// undo button and the palette.
export function UiRoot({
  stock,
  stamina,
  power,
  storageFull,
  edgeMenu,
  nodeMenu,
  undo,
  ...palette
}: Props) {
  return (
    <>
      <StockHud
        stock={stock}
        stamina={stamina}
        power={power}
        storageFull={storageFull}
      />
      <EdgeMenu {...edgeMenu} />
      <NodeMenu {...nodeMenu} />
      <UndoButton {...undo} />
      <Palette {...palette} />
    </>
  );
}
