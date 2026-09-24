import { h, render } from "preact";
import { MVP_SCENARIO } from "./data/scenarios/mvp";
import { createLoop, type Loop } from "./loop";
import { installErrorHandler } from "./platform/errors";
import { createApp } from "./render/app";
import { createRenderer } from "./render/renderer";
import { CommandQueue } from "./sim/commands/commandQueue";
import { EventQueue } from "./sim/events";
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
const renderer = createRenderer(app, state);
loop = createLoop({
  step() {
    tick(state, commands, events.emit);
    events.drain();
  },
  frame: renderer.frame,
});

render(h(UiRoot, null), document.getElementById("ui-root")!);
if (!paused) loop.start();

if (import.meta.env.DEV || new URLSearchParams(location.search).has("debug")) {
  const { installDebugTools } = await import("./debug/tools");
  installDebugTools({ state, commands, events, loop, app });
}
