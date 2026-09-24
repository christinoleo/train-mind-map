import type { ReadonlySignal } from "@preact/signals";
import type { ComponentProps } from "preact";
import type { ItemCounts } from "../data/items";
import type { PowerSummary } from "../sim/state/power";
import { EdgeMenu } from "./EdgeMenu";
import { ExportNotice } from "./ExportNotice";
import { Hint, type HintView } from "./Hint";
import { NodeMenu } from "./NodeMenu";
import { Palette } from "./Palette";
import { ResearchNotice, ResearchPanel } from "./ResearchPanel";
import { SettingsMenu } from "./SettingsMenu";
import { StockHud } from "./StockHud";
import { UndoButton } from "./UndoButton";

type Props = ComponentProps<typeof Palette> & {
  /** The edge menu, open while an edge is selected. */
  edgeMenu: ComponentProps<typeof EdgeMenu>;
  /** The node menu, open while a node is selected. */
  nodeMenu: ComponentProps<typeof NodeMenu>;
  undo: ComponentProps<typeof UndoButton>;
  research: ComponentProps<typeof ResearchPanel>;
  researchNotice: ComponentProps<typeof ResearchNotice>;
  settings: ComponentProps<typeof SettingsMenu>;
  exportNotice: ComponentProps<typeof ExportNotice>;
  /** The onboarding hint shown now, if any. */
  onboardingHint: ReadonlySignal<HintView | null>;
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
// undo, research and settings buttons, the palette, the onboarding hint
// and the research and export notices.
export function UiRoot({
  stock,
  stamina,
  power,
  storageFull,
  edgeMenu,
  nodeMenu,
  undo,
  research,
  researchNotice,
  settings,
  exportNotice,
  onboardingHint,
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
      <ResearchPanel {...research} />
      <SettingsMenu {...settings} />
      <Palette {...palette} />
      <Hint hint={onboardingHint} />
      <ResearchNotice {...researchNotice} />
      <ExportNotice {...exportNotice} />
    </>
  );
}
