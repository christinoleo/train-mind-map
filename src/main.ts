import { Application } from "pixi.js";

const app = new Application();
await app.init({
  background: "#0b1e3a",
  resizeTo: window,
  preference: "webgl",
  antialias: true,
  autoDensity: true,
  resolution: window.devicePixelRatio,
});
document.getElementById("pixi-container")!.appendChild(app.canvas);
