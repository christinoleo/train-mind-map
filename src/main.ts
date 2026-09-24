import { effect, signal } from "@preact/signals";
import { h, render } from "preact";
import type { NodeKind } from "./data/nodes";
import { MVP_SCENARIO } from "./data/scenarios/mvp";
import { Camera } from "./input/camera";
import { Controls } from "./input/controls";
import { PlaceTool } from "./input/tools/place";
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
const placeTool = new PlaceTool({
  state,
  camera,
  dispatch: (command) => commands.dispatch(state, command),
  showGhost: renderer.setGhost,
  showHint: (reason) => (hint.value = reason),
});
effect(() => {
  const kind = selected.value;
  if (kind) {
    placeTool.select(kind, {
      x: app.screen.width / 2,
      y: app.screen.height / 2,
    });
    controls.tool = placeTool;
  } else {
    placeTool.deselect();
    controls.tool = null;
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
    placeTool.refresh();
  },
  frame: renderer.frame,
});

render(
  h(UiRoot, { unlocked, selected, hint }),
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
