import { Container, type Application } from "pixi.js";
import type { Rect } from "../sim/geometry/rect";
import type { GameState } from "../sim/state/gameState";
import { fitArea } from "./camera";
import { createLayers } from "./layers";
import { drawCore, drawDeposits, drawTerrain, revealedBounds } from "./mapView";
import type { DeepReadonly } from "./readonly";
import { toWorld } from "./theme";

export interface Renderer {
  /** Draws one frame; `alpha` is the loop's interpolation factor. */
  frame(alpha: number): void;
}

/**
 * Draws `state` into `app`'s stage. It only reads the state (architecture
 * §Padrão 3). The map is rebuilt when the revealed area grows, and after the
 * WebGL context comes back from a loss.
 */
export function createRenderer(
  app: Application,
  state: DeepReadonly<GameState>,
): Renderer {
  const world = app.stage.addChild(new Container({ label: "world" }));
  const layers = createLayers(world);

  let drawnRing = -1;
  /** The revealed area drawn last, in world units. */
  let drawnArea: Rect | null = null;
  let fittedWidth = 0;
  let fittedHeight = 0;
  let contextLost = false;

  const rebuildMap = () => {
    const { map } = state;
    const bounds = revealedBounds(map);
    for (const layer of [layers.terrain, layers.deposits, layers.nodes]) {
      for (const child of layer.removeChildren()) child.destroy();
    }
    layers.terrain.addChild(drawTerrain(map, bounds));
    layers.deposits.addChild(drawDeposits(map, bounds));
    layers.nodes.addChild(drawCore(map));
    drawnRing = map.revealedRing;
    drawnArea = toWorld(bounds);
    fittedWidth = 0;
  };

  const fitCamera = (area: Rect) => {
    const { width, height } = app.screen;
    if (fittedWidth === width && fittedHeight === height) return;
    const fit = fitArea(area, width, height);
    world.scale.set(fit.scale);
    world.position.set(fit.x, fit.y);
    fittedWidth = width;
    fittedHeight = height;
  };

  // Pixi resets its GPU caches on restore; the scene is rebuilt on top so no
  // object keeps a handle from the lost context (pixijs#12224).
  app.canvas.addEventListener("webglcontextlost", () => {
    contextLost = true;
  });
  app.canvas.addEventListener("webglcontextrestored", () => {
    contextLost = false;
    drawnRing = -1;
  });

  return {
    frame() {
      if (contextLost) return;
      if (drawnRing !== state.map.revealedRing) rebuildMap();
      fitCamera(drawnArea!);
      app.render();
    },
  };
}
