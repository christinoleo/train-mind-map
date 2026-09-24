import { effect, signal } from "@preact/signals";
import { UI_PUBLISH_MS } from "./config/constants";
import { h, render } from "preact";
import { ITEMS, type ItemCounts } from "./data/items";
import type { NodeKind } from "./data/nodes";
import { MVP_SCENARIO } from "./data/scenarios/mvp";
import { Camera } from "./input/camera";
import { Controls } from "./input/controls";
import { PlaceTool } from "./input/tools/place";
import { TapTool } from "./input/tools/tap";
import { createLoop, type Loop } from "./loop";
import { installErrorHandler } from "./platform/errors";
import { createApp } from "./render/app";
import { createRenderer } from "./render/renderer";
import { CommandQueue } from "./sim/commands/commandQueue";
import { EventQueue } from "./sim/events";
import type { FailReason } from "./sim/result";
import { createGameState } from "./sim/state/gameState";
import { tick } from "./sim/tick";
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
let published = -Infinity;
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
events.on("CommandRejected", ({ command, reason }) => {
  if (command === "ManualTap") tapTool.rejected(reason);
});
effect(() => {
  const kind = selected.value;
  if (kind) {
    tapTool.cancel();
    placeTool.select(kind, {
      x: app.screen.width / 2,
      y: app.screen.height / 2,
    });
    controls.tool = placeTool;
  } else {
    placeTool.deselect();
    controls.tool = tapTool;
  }
});

loop = createLoop({
  step() {
    tick(state, commands, events.emit);
    events.drain();
    // Research (Epic 4) and a new game change what the palette offers.
    if (unlocked.value.length !== state.unlockedNodes.length) {
      unlocked.value = [...state.unlockedNodes];
    }
    controls.tool?.refresh?.();
    // Stamina drains per tap, so the bar follows it every tick.
    stamina.value = state.stamina.points;
  },
  frame(alpha) {
    renderer.frame(alpha);
    // The stock changes most ticks once the factory runs; the HUD follows
    // it at a readable rate.
    const now = performance.now();
    if (now - published >= UI_PUBLISH_MS) {
      // `updateStock` replaces the cache each tick, so it can be shared as is;
      // publishing only on a change keeps the HUD from re-rendering idle.
      if (!sameCounts(stock.value, state.stock)) stock.value = state.stock;
      published = now;
    }
  },
});

render(
  h(UiRoot, { unlocked, selected, hint, stock, stamina }),
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

function sameCounts(a: ItemCounts, b: ItemCounts): boolean {
  return ITEMS.every((item) => a[item] === b[item]);
}
