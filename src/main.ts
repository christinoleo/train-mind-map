import { effect, signal } from "@preact/signals";
import { UI_PUBLISH_MS } from "./config/constants";
import { h, render } from "preact";
import { ITEMS, type ItemCounts } from "./data/items";
import type { NodeKind } from "./data/nodes";
import { MVP_SCENARIO } from "./data/scenarios/mvp";
import { Camera } from "./input/camera";
import { Controls, type Tool } from "./input/controls";
import { ConnectTool } from "./input/tools/connect";
import { PlaceTool } from "./input/tools/place";
import { TapTool } from "./input/tools/tap";
import { createLoop, type Loop } from "./loop";
import { installErrorHandler } from "./platform/errors";
import { createApp } from "./render/app";
import { createRenderer } from "./render/renderer";
import { CommandQueue } from "./sim/commands/commandQueue";
import { RemoveEdge } from "./sim/commands/removeEdge";
import { UpgradeEdge } from "./sim/commands/upgradeEdge";
import { EventQueue } from "./sim/events";
import type { FailReason } from "./sim/result";
import { createGameState } from "./sim/state/gameState";
import { powerSummary, type PowerSummary } from "./sim/state/power";
import type { EdgeId } from "./sim/state/ids";
import { tick } from "./sim/tick";
import { edgeMenuInfo, type EdgeMenuInfo } from "./ui/EdgeMenu";
import { UiRoot } from "./ui/UiRoot";

// Installed first so boot failures, map generation included, show the crash
// screen too. The loop starts only after boot, so a crash during boot is
// remembered and keeps it from starting.
let paused = false;
let loop: Loop | undefined = undefined;
installErrorHandler({
  pause: () => {
    paused = true;
    loop?.stop();
  },
});

const state = createGameState(MVP_SCENARIO);
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
const stock = signal<ItemCounts>(state.stock);
const stamina = signal(state.stamina.points);
const power = signal<PowerSummary>(powerSummary(state.power));
const selectedEdge = signal<EdgeId | null>(null);
const edgeMenu = signal<EdgeMenuInfo | null>(null);
let published = -Infinity;
let lastFrame = performance.now();
events.on("ConstructionPaid", renderer.showConstruction);
events.on("ManualTapped", renderer.showTap);
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
// With nothing to place, a drag from an output connector connects, a tap on
// an edge opens its menu, and any other tap mines by hand.
const buildTool: Tool = {
  tap(p) {
    if (!connectTool.tap(p)) tapTool.tap(p);
  },
  dragStart: (p, from, held) => connectTool.dragStart(p, from, held),
  dragMove: (p) => connectTool.dragMove(p),
  dragEnd: (p) => connectTool.dragEnd(p),
  frame: (dtMs) => connectTool.frame(dtMs),
  refresh() {
    tapTool.refresh();
    connectTool.refresh();
  },
  cancel() {
    tapTool.cancel();
    connectTool.cancel();
  },
};
events.on("CommandRejected", ({ command, reason }) => {
  if (command === "ManualTap") tapTool.rejected(reason);
});
effect(() => {
  const kind = selected.value;
  if (kind) {
    buildTool.cancel();
    selectedEdge.value = null;
    placeTool.select(kind, {
      x: app.screen.width / 2,
      y: app.screen.height / 2,
    });
    controls.tool = placeTool;
  } else {
    placeTool.deselect();
    controls.tool = buildTool;
  }
});
effect(() => {
  renderer.setSelectedEdge(selectedEdge.value);
  publishEdgeMenu();
});

/** Publishes the selected edge to its menu, closing it once the edge is gone. */
function publishEdgeMenu() {
  const id = selectedEdge.peek();
  const info = id === null ? null : edgeMenuInfo(state, id);
  if (id !== null && !info) selectedEdge.value = null;
  if (JSON.stringify(info) !== JSON.stringify(edgeMenu.peek())) {
    edgeMenu.value = info;
  }
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
    publishEdgeMenu();
    // Stamina drains per tap, so the bar follows it every tick.
    stamina.value = state.stamina.points;
  },
  frame(alpha) {
    const now = performance.now();
    controls.tool?.frame?.(now - lastFrame);
    lastFrame = now;
    renderer.frame(alpha);
    // The stock changes most ticks once the factory runs; the HUD follows
    // it at a readable rate.
    if (now - published >= UI_PUBLISH_MS) {
      // `updateStock` replaces the cache each tick, so it can be shared as is;
      // publishing only on a change keeps the HUD from re-rendering idle.
      if (!sameCounts(stock.value, state.stock)) stock.value = state.stock;
      const summary = powerSummary(state.power);
      if (!samePower(power.value, summary)) power.value = summary;
      published = now;
    }
  },
});

render(
  h(UiRoot, {
    unlocked,
    selected,
    hint,
    stock,
    stamina,
    power,
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
  }),
  document.getElementById("ui-root")!,
);
if (!paused) loop.start();

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
  });
}

function samePower(a: PowerSummary, b: PowerSummary): boolean {
  return a.supply === b.supply && a.demand === b.demand && a.short === b.short;
}

function sameCounts(a: ItemCounts, b: ItemCounts): boolean {
  return ITEMS.every((item) => a[item] === b[item]);
}
