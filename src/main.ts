import { Application } from "pixi.js";
import { h, render } from "preact";
import { DEFAULT_SEED } from "./config/constants";
import { createLoop, type Loop } from "./loop";
import { installErrorHandler } from "./platform/errors";
import { CommandQueue } from "./sim/commands/commandQueue";
import { EventQueue } from "./sim/events";
import { createGameState } from "./sim/state/gameState";
import { tick } from "./sim/tick";
import { UiRoot } from "./ui/UiRoot";

const app = new Application();
// Installed first so boot failures, map generation included, show the crash
// screen too. The ticker only exists after init, so a crash during boot is
// remembered and applied then.
let paused = false;
let loop: Loop | undefined = undefined;
installErrorHandler({
  pause: () => {
    paused = true;
    loop?.stop();
    app.ticker?.stop();
  },
});

const state = createGameState(DEFAULT_SEED);
const commands = new CommandQueue();
const events = new EventQueue();
loop = createLoop({
  step() {
    tick(state, commands, events.emit);
    events.drain();
  },
  frame() {},
});

await app.init({
  background: "#0b1e3a",
  resizeTo: window,
  preference: "webgl",
  antialias: true,
  autoDensity: true,
  resolution: Math.min(window.devicePixelRatio, 2),
});
if (paused) app.ticker.stop();
document.getElementById("pixi-container")!.appendChild(app.canvas);
render(h(UiRoot, null), document.getElementById("ui-root")!);
if (!paused) loop.start();

if (import.meta.env.DEV || new URLSearchParams(location.search).has("debug")) {
  const { installDebugTools } = await import("./debug/tools");
  installDebugTools({ state, commands, events, loop });
}
