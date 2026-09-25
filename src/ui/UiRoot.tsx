import type { ReadonlySignal } from "@preact/signals";
import type { ComponentProps } from "preact";
import type { ItemCounts } from "../data/items";
import type { PowerSummary } from "../sim/state/power";
import { EdgeMenu } from "./EdgeMenu";
import { ExportNotice } from "./ExportNotice";
import { Hint, type HintView } from "./Hint";
import { LinePanel, LinePick } from "./LinePanel";
import { NodeMenu } from "./NodeMenu";
import { OfflineReport } from "./OfflineReport";
import { Palette } from "./Palette";
import { RailMenu } from "./RailMenu";
import { RailToggle } from "./RailToggle";
import { ResearchNotice, ResearchPanel } from "./ResearchPanel";
import { SettingsMenu } from "./SettingsMenu";
import { StockHud } from "./StockHud";
import { UndoButton } from "./UndoButton";

type Props = ComponentProps<typeof Palette> & {
  /** The edge menu, open while an edge is selected. */
  edgeMenu: ComponentProps<typeof EdgeMenu>;
  /** The node menu, open while a node is selected. */
  nodeMenu: ComponentProps<typeof NodeMenu>;
  /** The rail menu, open while a rail is selected. */
  railMenu: ComponentProps<typeof RailMenu>;
  /** The Line panel, open while a Line is selected. */
  linePanel: ComponentProps<typeof LinePanel>;
  /** The prompt while a new Line's first Station is picked. */
  linePick: ComponentProps<typeof LinePick>;
  railToggle: ComponentProps<typeof RailToggle>;
  undo: ComponentProps<typeof UndoButton>;
  research: ComponentProps<typeof ResearchPanel>;
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
  /** The ⚡ supplied and drawn, over every mesh. */
  power: ReadonlySignal<PowerSummary>;
  /** True while the Core and every Box are full. */
  storageFull: ReadonlySignal<boolean>;
};

// The DOM overlay layer above the canvas: the HUD capsule, the menus, the
// Line panel and its pick prompt, the undo, research, settings and rail layer
// buttons, the palette, the onboarding hint, the research and export notices
// and the offline report.
export function UiRoot({
  stock,
  stamina,
  power,
  storageFull,
  edgeMenu,
  nodeMenu,
  railMenu,
  linePanel,
  linePick,
  railToggle,
  undo,
  research,
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
        storageFull={storageFull}
      />
      <EdgeMenu {...edgeMenu} />
      <NodeMenu {...nodeMenu} />
      <RailMenu {...railMenu} />
      <LinePanel {...linePanel} />
      <LinePick {...linePick} />
      <UndoButton {...undo} />
      <ResearchPanel {...research} />
      <SettingsMenu {...settings} />
      <RailToggle {...railToggle} />
      <Palette {...palette} />
      <Hint hint={onboardingHint} />
      <ResearchNotice {...researchNotice} />
      <ExportNotice {...exportNotice} />
      <OfflineReport {...offlineReport} />
    </>
  );
}
