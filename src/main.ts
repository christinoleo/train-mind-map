import { Application } from "pixi.js";
import { h, render } from "preact";
import { installErrorHandler } from "./platform/errors";
import { appOptions } from "./render/app";
import { UiRoot } from "./ui/UiRoot";

const app = new Application();
// Installed before init so boot failures show the crash screen too. The ticker
// only exists after init, so a crash during boot is remembered and applied then.
let paused = false;
installErrorHandler({
  pause: () => {
    paused = true;
    app.ticker?.stop();
  },
});

await app.init(appOptions());
if (paused) app.ticker.stop();
document.getElementById("pixi-container")!.appendChild(app.canvas);
render(h(UiRoot, null), document.getElementById("ui-root")!);

if (import.meta.env.DEV || new URLSearchParams(location.search).has("debug")) {
  const { installDebugTools } = await import("./debug/tools");
  installDebugTools();
}
