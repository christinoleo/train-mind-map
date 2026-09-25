import type { ReadonlySignal } from "@preact/signals";
import type { ComponentProps } from "preact";
import type { ItemCounts } from "../data/items";
import type { PowerSummary } from "../sim/state/power";
import { EdgeMenu } from "./EdgeMenu";
import { ExportNotice } from "./ExportNotice";
import { Hint, type HintView } from "./Hint";
import { InventoryPanel } from "./InventoryPanel";
import { LinePanel, LinePick } from "./LinePanel";
import { NodeMenu } from "./NodeMenu";
import { OfflineReport } from "./OfflineReport";
import { Palette } from "./Palette";
import { RailMenu } from "./RailMenu";
import { RailToggle } from "./RailToggle";
import { RemovedToast } from "./RemovedToast";
import { ResearchNotice, ResearchPanel } from "./ResearchPanel";
import { SettingsMenu } from "./SettingsMenu";
import { StockHud } from "./StockHud";
import { UndoButton } from "./UndoButton";

type Props = ComponentProps<typeof Palette> & {
  /** The edge's action bubble, open while an edge is selected. */
  edgeMenu: ComponentProps<typeof EdgeMenu>;
  /** The node's action bubble, open while a node is selected. */
  nodeMenu: ComponentProps<typeof NodeMenu>;
  /** "Removido · Desfazer", after a removal from a bubble. */
  removedToast: ComponentProps<typeof RemovedToast>;
  /** The rail menu, open while a rail is selected. */
  railMenu: ComponentProps<typeof RailMenu>;
  /** The Line panel, open while a Line is selected. */
  linePanel: ComponentProps<typeof LinePanel>;
  /** The prompt while a new Line's first Station is picked. */
  linePick: ComponentProps<typeof LinePick>;
  railToggle: ComponentProps<typeof RailToggle>;
  undo: ComponentProps<typeof UndoButton>;
  research: ComponentProps<typeof ResearchPanel>;
  inventory: ComponentProps<typeof InventoryPanel>;
  researchNotice: ComponentProps<typeof ResearchNotice>;
  settings: ComponentProps<typeof SettingsMenu>;
  exportNotice: ComponentProps<typeof ExportNotice>;
  /** "Enquanto você esteve fora", on return from an absence. */
  offlineReport: ComponentProps<typeof OfflineReport>;
  /** The onboarding hint shown now, if any. */
  onboardingHint: ReadonlySignal<HintView | null>;
  /** The global stock, published by the UI bridge. */
  stock: ReadonlySignal<ItemCounts>;
  /** The stamina points left. */
  stamina: ReadonlySignal<number>;
  /** The ⚡ supplied and drawn, over the grid. */
  power: ReadonlySignal<PowerSummary>;
};

// The DOM overlay layer above the canvas: the HUD capsule, the inventory,
// the action bubbles and their removal toast, the menus, the Line panel and its pick prompt, the undo, research, settings
// and rail layer buttons, the palette, the onboarding hint, the research and export notices
// and the offline report.
export function UiRoot({
  stock,
  stamina,
  power,
  edgeMenu,
  nodeMenu,
  removedToast,
  railMenu,
  linePanel,
  linePick,
  railToggle,
  undo,
  research,
  inventory,
  researchNotice,
  settings,
  exportNotice,
  onboardingHint,
  offlineReport,
  ...palette
}: Props) {
  return (
    <>
      <StockHud
        stock={stock}
        stamina={stamina}
        power={power}
        inventoryOpen={inventory.open}
      />
      <EdgeMenu {...edgeMenu} />
      <NodeMenu {...nodeMenu} />
      <RailMenu {...railMenu} />
      <LinePanel {...linePanel} />
      <LinePick {...linePick} />
      <UndoButton {...undo} />
      <ResearchPanel {...research} />
      <InventoryPanel {...inventory} />
      <SettingsMenu {...settings} />
      <RailToggle {...railToggle} />
      <Palette {...palette} />
      <Hint hint={onboardingHint} />
      <RemovedToast {...removedToast} />
      <ResearchNotice {...researchNotice} />
      <ExportNotice {...exportNotice} />
      <OfflineReport {...offlineReport} />
    </>
  );
}
