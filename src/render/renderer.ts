import { Container, type Application } from "pixi.js";
import type { GameState } from "../sim/state/gameState";
import { fitArea } from "./camera";
import { createLayers, type Layers } from "./layers";
import { drawCore, drawDeposits, drawTerrain, revealedBounds } from "./mapView";
import type { DeepReadonly } from "./readonly";
import { CELL_PX } from "./theme";

export interface Renderer {
  /** Draws one frame; `alpha` is the loop's interpolation factor. */
  frame(alpha: number): void;
  readonly layers: Layers;
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
  let fitted = { ring: -1, width: 0, height: 0 };
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
  };

  const fitCamera = () => {
    const { width, height } = app.screen;
    const ring = state.map.revealedRing;
    if (
      fitted.ring === ring &&
      fitted.width === width &&
      fitted.height === height
    )
      return;
    const b = revealedBounds(state.map);
    const fit = fitArea(
      {
        x: b.x * CELL_PX,
        y: b.y * CELL_PX,
        w: b.w * CELL_PX,
        h: b.h * CELL_PX,
      },
      width,
      height,
    );
    world.scale.set(fit.scale);
    world.position.set(fit.x, fit.y);
    fitted = { ring, width, height };
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
    layers,
    frame() {
      if (contextLost) return;
      if (drawnRing !== state.map.revealedRing) rebuildMap();
      fitCamera();
      app.render();
    },
  };
}
