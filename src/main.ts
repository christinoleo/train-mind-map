import { computed, effect, signal, type Signal } from "@preact/signals";
import {
  HINT_HALF_WIDTH_PX,
  HINT_MS,
  HINT_TOP_PX,
  OFFLINE_BUDGET_MS,
  OFFLINE_REPORT_MIN_MS,
  UI_PUBLISH_MS,
} from "./config/constants";
import { h, render } from "preact";
import { ITEMS, type ItemCounts } from "./data/items";
import type { NodeKind } from "./data/nodes";
import { FINAL_RESEARCH, type ResearchId } from "./data/research";
import { MVP_SCENARIO } from "./data/scenarios/mvp";
import { Camera } from "./input/camera";
import { Controls, type Tool } from "./input/controls";
import { nodeAt } from "./input/hitTest";
import { ConnectTool } from "./input/tools/connect";
import { MoveTool } from "./input/tools/move";
import { PlaceTool } from "./input/tools/place";
import { RailTool } from "./input/tools/rail";
import { TapTool } from "./input/tools/tap";
import { createLoop, type Loop } from "./loop";
import { installErrorHandler } from "./platform/errors";
import { isIosIframe } from "./platform/ios";
import { log, type LogEntry } from "./platform/log";
import {
  encodeSave,
  exportText,
  idbStore,
  importText,
  loadState,
  SaveSlots,
  startAutosave,
  type BootSave,
  type SaveFile,
} from "./platform/save";
import { loadSettings, saveSettings, type Settings } from "./platform/settings";
import { createApp } from "./render/app";
import type { Focus } from "./render/layers";
import { createRenderer } from "./render/renderer";
import { CommandQueue } from "./sim/commands/commandQueue";
import { RemoveEdge } from "./sim/commands/removeEdge";
import { RemoveNode } from "./sim/commands/removeNode";
import { PlaceTrain } from "./sim/commands/placeTrain";
import { RemoveLine } from "./sim/commands/removeLine";
import { RemoveRail } from "./sim/commands/removeRail";
import { RemoveTrain } from "./sim/commands/removeTrain";
import { SetDeparture } from "./sim/commands/setDeparture";
import { SetBoxConstruction } from "./sim/commands/setBoxConstruction";
import { SetRecipe } from "./sim/commands/setRecipe";
import { SetResearch } from "./sim/commands/setResearch";
import { UpgradeEdge } from "./sim/commands/upgradeEdge";
import { UpgradeNode } from "./sim/commands/upgradeNode";
import { EventQueue } from "./sim/events";
import { clamp } from "./sim/math";
import { fastForward, type OfflineReport } from "./sim/offline/fastForward";
import { ok, type FailReason, type Result } from "./sim/result";
import { createGameState, type GameState } from "./sim/state/gameState";
import type { EdgeId, LineId, NodeId, RailId } from "./sim/state/ids";
import { powerSummary, type PowerSummary } from "./sim/state/power";
import { isStorageFull } from "./sim/state/stock";
import { tick } from "./sim/tick";
import { edgeMenuInfo, type EdgeMenuInfo } from "./ui/EdgeMenu";
import type { HintView } from "./ui/Hint";
import { BackupDialog } from "./ui/BackupDialog";
import { nodeMenuInfo, type NodeMenuInfo } from "./ui/NodeMenu";
import type { OfflineReportView } from "./ui/OfflineReport";
import { linePanelInfo, type LinePanelInfo } from "./ui/LinePanel";
import { railMenuInfo, type RailMenuInfo } from "./ui/RailMenu";
import { Onboarding, type HintTarget } from "./ui/onboarding";
import { researchInfo, type ResearchInfo } from "./ui/ResearchPanel";
import { showOverlay } from "./ui/overlay";
import { UiRoot } from "./ui/UiRoot";

// Installed first so boot failures, map generation included, show the crash
// screen too. The loop starts only after boot, so a crash during boot is
// remembered and keeps it from starting.
let paused = false;
let loop: Loop | undefined = undefined;
let stopAutosave: (() => void) | undefined = undefined;
/** The game, once boot has one, for the crash save and export. */
let game: GameState | undefined = undefined;
const slots = new SaveSlots(idbStore());
installErrorHandler({
  pause: () => {
    paused = true;
    loop?.stop();
    // A broken state must not overwrite the last good save.
    stopAutosave?.();
  },
  saveCrash(logEntries) {
    if (!game) return;
    slots
      .saveCrash(game, logEntries)
      .catch((error: unknown) =>
        log.error("save", "crash save failed", String(error)),
      );
  },
  exportSave: () => game && exportGame(game, log.entries()),
});

const booted = await slots.load().catch((error: unknown): BootSave => {
  // No IndexedDB (a private window, blocked storage): play without saves.
  log.error("save", "save storage unavailable", String(error));
  return { kind: "none" };
});
const saved =
  booted.kind === "failed" ? await offerBackup(booted.backup) : booted;
const state =
  saved.kind === "loaded"
    ? loadState(saved.save)
    : createGameState(MVP_SCENARIO);
game = state;
// The factory kept working while the game was closed (FR120).
const bootReport =
  saved.kind === "loaded"
    ? reportView(makeUpFor(Date.now() - saved.save.savedAt))
    : null;
const commands = new CommandQueue();
const events = new EventQueue();
const app = await createApp(document.getElementById("pixi-container")!);
const camera = new Camera();
const controls = new Controls(camera, app.canvas);
const renderer = createRenderer(app, state, camera);

// The UI reads signals, never the state (architecture §Ponte com a UI).
const unlocked = signal<readonly NodeKind[]>([...state.unlockedNodes]);
const selected = signal<NodeKind | null>(null);
const hint = signal<FailReason | null>(null);
/** A refused action's reason, shown for a moment over the tools' own hints. */
const flash = signal<FailReason | null>(null);
const stock = signal<ItemCounts>(state.stock);
const stamina = signal(state.stamina.points);
const power = signal<PowerSummary>(powerSummary(state.power));
const selectedEdge = signal<EdgeId | null>(null);
const edgeMenu = signal<EdgeMenuInfo | null>(null);
const selectedNode = signal<NodeId | null>(null);
const nodeMenu = signal<NodeMenuInfo | null>(null);
const selectedRail = signal<RailId | null>(null);
const railMenu = signal<RailMenuInfo | null>(null);
const selectedLine = signal<LineId | null>(null);
const linePanel = signal<LinePanelInfo | null>(null);
/** The Station picked as a new Line's first stop, on the rail layer. */
const linePick = signal<NodeId | null>(null);
/** The layer the player works on (FR78). */
const focus = signal<Focus>("factory");
const storageFull = signal(false);
const canUndo = signal(false);
const researchOpen = signal(false);
const research = signal<ResearchInfo>(researchInfo(state));
/** The research completed last, shown for a moment. */
const completed = signal<ResearchId | null>(null);
/** True while the end-of-content notice is open (FR110). */
const ended = signal(false);
const settingsOpen = signal(false);
const exportNotice = signal(false);
const onboardingHint = signal<HintView | null>(null);
const offlineReport = signal<OfflineReportView | null>(bootReport);
/** The hint the last tick asked for; each frame places it on the screen. */
let hintTarget: HintTarget | null = null;
// The hints wait for the settings, which say how many were seen already.
let onboarding: Onboarding | undefined;
let settings: Settings | undefined;
void loadSettings().then((loaded) => {
  settings = loaded;
  onboarding = new Onboarding(loaded.hintsSeen, (hintsSeen) => {
    settings = { ...settings!, hintsSeen };
    void saveSettings(settings);
  });
  // Safari may drop the storage of a game in an iframe (NFR14).
  exportNotice.value = isIosIframe() && !loaded.exportNoticeDismissed;
});
/** Returns a function that shows a value in `target` for a moment. */
function flasher<T>(target: Signal<T | null>): (value: T) => void {
  let timer: number | undefined;
  return (value) => {
    target.value = value;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => (target.value = null), HINT_MS);
  };
}
let published = -Infinity;
let lastFrame = performance.now();
events.on("ConstructionPaid", renderer.showConstruction);
events.on("ManualTapped", renderer.showTap);
events.on("ManualTapped", () => onboarding?.tapped());
const flashCompleted = flasher(completed);
// The research jingle plays here too, once there is audio (FR116).
events.on("ResearchDone", (event) => {
  flashCompleted(event.research);
  if (event.research === FINAL_RESEARCH) ended.value = true;
});
const placeTool = new PlaceTool({
  state,
  camera,
  dispatch: (command) => commands.dispatch(state, command),
  showGhost: renderer.setGhost,
  showHint: (reason) => (hint.value = reason),
});
const tapTool = new TapTool({
  state,
  camera,
  dispatch: (command) => commands.dispatch(state, command),
  showHint: (reason) => (hint.value = reason),
});
const connectTool = new ConnectTool({
  state,
  camera,
  viewport: () => app.screen,
  dispatch: (command) => commands.dispatch(state, command),
  showPreview: renderer.setEdgePreview,
  selectEdge: (id) => (selectedEdge.value = id),
});
/** Shows why an action was refused for a moment. */
const flashHint = flasher(flash);
const moveTool = new MoveTool({
  state,
  camera,
  viewport: () => app.screen,
  dispatch: (command) => commands.dispatch(state, command),
  showGhost: renderer.setGhost,
  showPreview: renderer.setEdgePreview,
  showMoving: renderer.setMoving,
  showHint: flashHint,
});
const railTool = new RailTool({
  state,
  camera,
  viewport: () => app.screen,
  dispatch: (command) => commands.dispatch(state, command),
  showPreview: renderer.setEdgePreview,
  selectRail: (id) => (selectedRail.value = id),
  selectLine: (id) => (selectedLine.value = id),
  showPick: (id) => (linePick.value = id),
  showHint: flashHint,
});
// A Line just created opens its panel.
events.on("LineCreated", ({ line }) => (selectedLine.value = line));
// With nothing to place, a long press on a node and a drag move it, a drag
// from an output connector connects, a tap on a node or an edge opens its
// menu, and any other tap mines by hand.
const buildTool: Tool = {
  tap(p) {
    const node = nodeAt(state, camera.toWorld(p.x, p.y));
    selectedNode.value = node?.id ?? null;
    if (node) selectedEdge.value = null;
    else if (!connectTool.tap(p)) tapTool.tap(p);
  },
  longPress(p) {
    selectedNode.value = null;
    selectedEdge.value = null;
    moveTool.longPress(p);
  },
  holdEnd: () => moveTool.holdEnd(),
  dragStart: (p, from, held) =>
    moveTool.dragStart(p, from, held) || connectTool.dragStart(p, from, held),
  dragMove(p) {
    moveTool.dragMove(p);
    connectTool.dragMove(p);
  },
  dragEnd(p) {
    moveTool.dragEnd(p);
    connectTool.dragEnd(p);
  },
  frame(dtMs) {
    moveTool.frame(dtMs);
    connectTool.frame(dtMs);
  },
  refresh() {
    tapTool.refresh();
    moveTool.refresh();
    connectTool.refresh();
  },
  cancel() {
    tapTool.cancel();
    moveTool.cancel();
    connectTool.cancel();
  },
};
events.on("CommandRejected", ({ command, reason }) => {
  if (command === "ManualTap") tapTool.rejected(reason);
  // Dispatch checks against the state before the commands queued ahead.
  else if (
    ["Undo", "MoveNode", "PlaceRail", "CreateLine", "PlaceTrain"].includes(
      command,
    )
  ) {
    flashHint(reason);
  }
});
/** The tool the map gets with nothing to place: the focused layer's. */
function mapTool(): Tool {
  return focus.peek() === "rails" ? railTool : buildTool;
}
effect(() => {
  const kind = selected.value;
  buildTool.cancel();
  railTool.cancel();
  if (kind) {
    selectedEdge.value = null;
    selectedNode.value = null;
    selectedRail.value = null;
    selectedLine.value = null;
    placeTool.select(kind, {
      x: app.screen.width / 2,
      y: app.screen.height / 2,
    });
    controls.tool = placeTool;
  } else {
    placeTool.deselect();
    controls.tool = mapTool();
  }
});
// The rail layer in focus dims the factory, and its tool takes the map:
// a drag from a rail port builds a rail, a tap on a rail opens its menu.
effect(() => {
  const rails = focus.value === "rails";
  renderer.setFocus(focus.value);
  // A node being placed keeps its ghost; the layer's tool waits for it.
  if (selected.peek() === null) {
    buildTool.cancel();
    railTool.cancel();
    controls.tool = mapTool();
  }
  if (rails) {
    selectedEdge.value = null;
    selectedNode.value = null;
  } else {
    selectedRail.value = null;
    selectedLine.value = null;
  }
});
/** Brings the other layer into focus (FR78). */
function toggleFocus() {
  if (!state.unlockedNodes.includes("station")) return;
  focus.value = focus.value === "rails" ? "factory" : "rails";
}
controls.shortcuts.set("KeyT", toggleFocus);
// The research panel and the menus share one place on screen: opening one
// closes the others.
const panels = [researchOpen, settingsOpen];
for (const panel of panels) {
  effect(() => {
    if (!panel.value) return;
    selectedEdge.value = null;
    selectedNode.value = null;
    selectedRail.value = null;
    selectedLine.value = null;
    for (const other of panels) if (other !== panel) other.value = false;
  });
}
effect(() => {
  if (
    selectedEdge.value !== null ||
    selectedNode.value !== null ||
    selectedRail.value !== null ||
    selectedLine.value !== null
  ) {
    for (const panel of panels) panel.value = false;
  }
});
effect(() => {
  renderer.setSelectedEdge(selectedEdge.value);
  publishMenu(selectedEdge, edgeMenu, edgeMenuInfo);
});
effect(() => {
  // Read to subscribe: publishMenu only peeks.
  void selectedNode.value;
  publishMenu(selectedNode, nodeMenu, nodeMenuInfo);
});
effect(() => {
  renderer.setSelectedRail(selectedRail.value);
  publishMenu(selectedRail, railMenu, railMenuInfo);
  publishMenu(selectedLine, linePanel, linePanelInfo);
});
effect(() => {
  void selectedLine.value;
  publishMenu(selectedLine, linePanel, linePanelInfo);
});

/** Publishes the selections to their menus, closing each once its target is gone. */
function publishMenus() {
  publishMenu(selectedEdge, edgeMenu, edgeMenuInfo);
  publishMenu(selectedNode, nodeMenu, nodeMenuInfo);
  publishMenu(selectedRail, railMenu, railMenuInfo);
}

function publishMenu<Id, Info>(
  selection: Signal<Id | null>,
  menu: Signal<Info | null>,
  infoOf: (state: GameState, id: Id) => Info | null,
) {
  const id = selection.peek();
  const info = id === null ? null : infoOf(state, id);
  if (id !== null && !info) selection.value = null;
  publishIfChanged(menu, info);
}

/** Sets `target` to `value` unless it already holds the same contents. */
function publishIfChanged<T>(target: Signal<T>, value: T) {
  if (JSON.stringify(value) !== JSON.stringify(target.peek())) {
    target.value = value;
  }
}

/** Replaces the game with a loaded one, dropping what referred to the old. */
function loadGame(save: SaveFile) {
  commands.clear();
  buildTool.cancel();
  selected.value = null;
  selectedNode.value = null;
  selectedEdge.value = null;
  selectedRail.value = null;
  selectedLine.value = null;
  focus.value = "factory";
  Object.assign(state, loadState(save));
}

/** The game as export text, with the log buffer in a crash export. */
function exportGame(
  current: GameState,
  logEntries?: LogEntry[],
): Promise<string> {
  return exportText(encodeSave(current, Date.now(), logEntries));
}

async function importSave(text: string): Promise<Result> {
  const save = await importText(text);
  if (!save.ok) return save;
  loadGame(save.value);
  // The game is loaded either way; without storage it just is not kept.
  slots
    .save(state)
    .catch((error: unknown) =>
      log.error("save", "imported save not written", String(error)),
    );
  return ok();
}

/**
 * Runs the offline path over an absence of `awayMs` (ADR-0003) and saves
 * at once, so a reload before the next autosave cannot count the same
 * absence twice.
 */
function makeUpFor(awayMs: number): OfflineReport {
  const report = fastForward(state, awayMs, {
    ms: OFFLINE_BUDGET_MS,
    now: () => performance.now(),
  });
  slots
    .save(state)
    .catch((error: unknown) =>
      log.error("save", "offline progress not saved", String(error)),
    );
  return report;
}

/**
 * The report as the UI shows it, or `null` for an absence too short or a
 * factory with nothing to tell (FR124).
 */
function reportView(report: OfflineReport): OfflineReportView | null {
  const { elapsedMs, produced, bottleneck } = report;
  if (elapsedMs < OFFLINE_REPORT_MIN_MS) return null;
  const node = bottleneck && state.nodes.get(bottleneck.node);
  if (Object.keys(produced).length === 0 && !node) return null;
  return {
    elapsedMs,
    produced,
    bottleneck: node ? { ...bottleneck, kind: node.kind } : null,
  };
}

/** Makes up for an absence during play and shows its report. */
function goOffline(ms: number) {
  const view = reportView(makeUpFor(ms));
  if (view) offlineReport.value = view;
}

/** Takes the camera to `id` and opens its menu. */
function showNode(id: NodeId) {
  if (renderer.centerOnNode(id)) selectedNode.value = id;
}

function undo() {
  const result = commands.undo(state);
  if (!result.ok) flashHint(result.reason);
}

loop = createLoop({
  step() {
    tick(state, commands, events.emit);
    events.drain();
    // Research (Epic 4) and a new game change what the palette offers.
    if (unlocked.value.length !== state.unlockedNodes.length) {
      unlocked.value = [...state.unlockedNodes];
    }
    controls.tool?.refresh?.();
    publishMenus();
    canUndo.value = commands.undoDepth > 0;
    // Stamina drains per tap, so the bar follows it every tick.
    stamina.value = state.stamina.points;
    hintTarget = onboarding?.update(state) ?? null;
  },
  // A tab back from the background (FR125).
  catchUp: goOffline,
  frame(alpha) {
    const now = performance.now();
    controls.tool?.frame?.(now - lastFrame);
    lastFrame = now;
    renderer.frame(alpha);
    // A world hint follows the camera.
    publishIfChanged(onboardingHint, hintView(hintTarget));
    // The stock changes most ticks once the factory runs; the HUD follows
    // it at a readable rate.
    if (now - published >= UI_PUBLISH_MS) {
      // `updateStock` replaces the cache each tick, so it can be shared as is;
      // publishing only on a change keeps the HUD from re-rendering idle.
      if (!sameCounts(stock.value, state.stock)) stock.value = state.stock;
      const summary = powerSummary(state.power);
      if (!samePower(power.value, summary)) power.value = summary;
      storageFull.value = isStorageFull(state);
      publishIfChanged(research, researchInfo(state));
      published = now;
    }
  },
});

render(
  h(UiRoot, {
    unlocked,
    selected,
    hint: computed(() => flash.value ?? hint.value),
    stock,
    stamina,
    power,
    storageFull,
    edgeMenu: {
      edge: edgeMenu,
      onUpgrade() {
        const id = selectedEdge.value;
        const next = edgeMenu.value?.upgrade?.level;
        if (id !== null && next) {
          commands.dispatch(state, new UpgradeEdge(id, next));
        }
      },
      onRemove() {
        const id = selectedEdge.value;
        if (id !== null) commands.dispatch(state, new RemoveEdge(id));
        selectedEdge.value = null;
      },
      onClose: () => (selectedEdge.value = null),
    },
    nodeMenu: {
      node: nodeMenu,
      onRecipe(recipe) {
        const id = selectedNode.value;
        if (id !== null) commands.dispatch(state, new SetRecipe(id, recipe));
      },
      onConstruction(noConstruction) {
        const id = selectedNode.value;
        if (id !== null) {
          commands.dispatch(state, new SetBoxConstruction(id, noConstruction));
        }
      },
      onUpgrade() {
        const id = selectedNode.value;
        if (id !== null) commands.dispatch(state, new UpgradeNode(id));
      },
      onRemove() {
        const id = selectedNode.value;
        if (id !== null) commands.dispatch(state, new RemoveNode(id));
        selectedNode.value = null;
      },
      onClose: () => (selectedNode.value = null),
    },
    railMenu: {
      rail: railMenu,
      onRemove() {
        const id = selectedRail.value;
        if (id !== null) commands.dispatch(state, new RemoveRail(id));
        selectedRail.value = null;
      },
      onClose: () => (selectedRail.value = null),
    },
    linePanel: {
      line: linePanel,
      onCondition(stop, condition) {
        const id = selectedLine.value;
        if (id !== null) {
          commands.dispatch(state, new SetDeparture(id, stop, condition));
        }
      },
      onAddTrain() {
        const id = selectedLine.value;
        if (id !== null) commands.dispatch(state, new PlaceTrain(id));
      },
      onRemoveTrain() {
        const id = selectedLine.value;
        const last = [...state.trains.values()]
          .filter((t) => t.line === id)
          .at(-1);
        if (last) commands.dispatch(state, new RemoveTrain(last.id));
      },
      onRemove() {
        const id = selectedLine.value;
        if (id !== null) commands.dispatch(state, new RemoveLine(id));
        selectedLine.value = null;
      },
      onClose: () => (selectedLine.value = null),
    },
    linePick: { station: linePick, onCancel: () => railTool.cancel() },
    railToggle: {
      focus,
      available: computed(() => unlocked.value.includes("station")),
      onToggle: toggleFocus,
    },
    undo: { canUndo, onUndo: undo },
    research: {
      research,
      open: researchOpen,
      onChoose(id) {
        commands.dispatch(state, new SetResearch(id));
      },
    },
    researchNotice: { completed, ended },
    settings: {
      open: settingsOpen,
      onReviewHints: () => onboarding?.reset(),
      exportSave: () => exportGame(state),
      importSave,
    },
    exportNotice: {
      show: exportNotice,
      onExport: () => (settingsOpen.value = true),
      onDismiss() {
        exportNotice.value = false;
        if (!settings) return;
        settings = { ...settings, exportNoticeDismissed: true };
        void saveSettings(settings);
      },
    },
    onboardingHint,
    offlineReport: { report: offlineReport, onBottleneck: showNode },
  }),
  document.getElementById("ui-root")!,
);
if (!paused) {
  loop.start();
  stopAutosave = startAutosave(() => slots.save(state));
}

if (import.meta.env.DEV || new URLSearchParams(location.search).has("debug")) {
  const { installDebugTools } = await import("./debug/tools");
  installDebugTools({
    state,
    commands,
    events,
    loop,
    app,
    renderer,
    camera,
    controls,
    world: MVP_SCENARIO,
    goOffline,
  });
}

/** Where `target` sits on the screen, kept on it. */
function hintView(target: HintTarget | null): HintView | null {
  if (!target) return null;
  // Placing already, where the ghost's own hints take the palette's place.
  if (target.at === "palette") return selected.peek() ? null : target;
  const { width, height } = app.screen;
  const { x, y } = camera.toScreen(target.point.x, target.point.y);
  return {
    id: target.id,
    at: "screen",
    // The capsule sits above its point, centred on it: keep it clear of
    // the edges, and of the HUD at the top.
    x: Math.round(
      clamp(
        x,
        Math.min(HINT_HALF_WIDTH_PX, width / 2),
        Math.max(width - HINT_HALF_WIDTH_PX, width / 2),
      ),
    ),
    y: Math.round(clamp(y, HINT_TOP_PX, height)),
  };
}

/**
 * Asks whether to load the backup of a save that failed to load (FR129),
 * before the game starts, so no autosave runs over either.
 */
function offerBackup(backup: SaveFile | null): Promise<BootSave> {
  return new Promise((resolve) => {
    const choose = (choice: BootSave) => {
      close();
      resolve(choice);
    };
    const close = showOverlay(
      h(BackupDialog, {
        hasBackup: backup !== null,
        onBackup: () => backup && choose({ kind: "loaded", save: backup }),
        onNewGame: () => choose({ kind: "none" }),
      }),
    );
  });
}

function samePower(a: PowerSummary, b: PowerSummary): boolean {
  return a.supply === b.supply && a.demand === b.demand && a.short === b.short;
}

function sameCounts(a: ItemCounts, b: ItemCounts): boolean {
  return ITEMS.every((item) => a[item] === b[item]);
}
