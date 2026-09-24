import { Container, type Application } from "pixi.js";
import type { GameState } from "../sim/state/gameState";
import type { Camera } from "../input/camera";
import { createLayers, type Layers } from "./layers";
import { applyLod } from "./lod";
import { drawCore, drawDeposits, drawTerrain, revealedBounds } from "./mapView";
import type { DeepReadonly } from "./readonly";
import { CELL_PX, toWorld } from "./theme";

export interface Renderer {
  /** Draws one frame; `alpha` is the loop's interpolation factor. */
  frame(alpha: number): void;
  readonly layers: Layers;
  /** Centres the camera on cell (x, y), keeping the zoom. */
  centerOn(x: number, y: number): void;
}

/**
 * Draws `state` into `app`'s stage. It only reads the state (architecture
 * §Padrão 3). The map is rebuilt when the revealed area grows, when the map
 * itself is replaced, and after the WebGL context comes back from a loss.
 * `camera` places the world on screen and picks the level of detail.
 */
export function createRenderer(
  app: Application,
  state: DeepReadonly<GameState>,
  camera: Camera,
): Renderer {
  const world = app.stage.addChild(new Container({ label: "world" }));
  const layers = createLayers(world);

  let drawnMap: object | null = null;
  /** The map the camera was last fitted to; a context restore keeps the view. */
  let fittedMap: object | null = null;
  let drawnRing = -1;
  let contextLost = false;

  const rebuildMap = () => {
    const { map } = state;
    const bounds = revealedBounds(map);
    for (const layer of [layers.terrain, layers.deposits, layers.nodes]) {
      for (const child of layer.removeChildren()) {
        child.destroy({ children: true });
      }
    }
    layers.terrain.addChild(drawTerrain(map, bounds));
    layers.deposits.addChild(drawDeposits(map, bounds));
    layers.nodes.addChild(drawCore(map));
    // A new map starts fitted on screen; a grown one keeps the view.
    camera.setBounds(toWorld(bounds), fittedMap !== map);
    fittedMap = map;
    drawnMap = map;
    drawnRing = map.revealedRing;
  };

  // Pixi resets its GPU caches on restore; the scene is rebuilt on top so no
  // object keeps a handle from the lost context (pixijs#12224).
  app.canvas.addEventListener("webglcontextlost", () => {
    contextLost = true;
  });
  app.canvas.addEventListener("webglcontextrestored", () => {
    contextLost = false;
    drawnMap = null;
  });

  return {
    frame() {
      if (contextLost) return;
      const { map } = state;
      camera.setViewport(app.screen.width, app.screen.height);
      if (drawnMap !== map || drawnRing !== map.revealedRing) rebuildMap();
      world.scale.set(camera.scale);
      world.position.set(camera.x, camera.y);
      applyLod(layers, camera.lod);
      app.render();
    },
    layers,
    centerOn(x, y) {
      camera.centerOn((x + 0.5) * CELL_PX, (y + 0.5) * CELL_PX);
    },
  };
}
