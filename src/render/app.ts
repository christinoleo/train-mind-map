import { Application, type ApplicationOptions } from "pixi.js";
import { BLUEPRINT } from "./theme";

/** Highest device pixel ratio the canvas renders at. */
export const MAX_RESOLUTION = 2;

/**
 * The Pixi `app.init` options shared by the game and the rendering stress
 * test, so the stress numbers always describe the renderer the game ships.
 */
export function appOptions(): Partial<ApplicationOptions> {
  return {
    background: BLUEPRINT.background,
    resizeTo: window,
    preference: "webgl",
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio, MAX_RESOLUTION),
  };
}

/**
 * Creates the game's only Pixi `Application`: one WebGL context is the iOS
 * context-loss mitigation (architecture §Riscos da plataforma). The ticker is
 * not started; the game loop renders each frame itself.
 */
export async function createApp(parent: HTMLElement): Promise<Application> {
  const app = new Application();
  await app.init({ ...appOptions(), autoStart: false, sharedTicker: false });
  parent.appendChild(app.canvas);
  return app;
}
