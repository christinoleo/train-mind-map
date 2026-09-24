import type { ApplicationOptions } from "pixi.js";

/**
 * The Pixi `app.init` options shared by the game and the rendering stress
 * test, so the stress numbers always describe the renderer the game ships.
 */
export function appOptions(): Partial<ApplicationOptions> {
  return {
    background: "#0b1e3a",
    resizeTo: window,
    preference: "webgl",
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio, 2),
  };
}
