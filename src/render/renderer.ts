import { Container, Graphics, type Application } from "pixi.js";
import type { SimEventOf } from "../sim/events";
import type { GameState } from "../sim/state/gameState";
import type { NodeId } from "../sim/state/ids";
import { nodeRect } from "../sim/state/nodes";
import type { Camera } from "../input/camera";
import type { Ghost } from "../input/tools/place";
import { Flights } from "./flights";
import { createLayers, type Layers } from "./layers";
import { applyLod } from "./lod";
import { drawDeposits, drawTerrain, revealedBounds } from "./mapView";
import { drawGhostOutline, drawNodeCard, NodeViews } from "./nodes";
import type { DeepReadonly } from "./readonly";
import {
  BUILD_FLIGHT_STAGGER_MS,
  CELL_PX,
  GHOST_ALPHA,
  ITEM_COLOR,
  toWorld,
} from "./theme";

export interface Renderer {
  /** Draws one frame; `alpha` is the loop's interpolation factor. */
  frame(alpha: number): void;
  readonly layers: Layers;
  /** Centres the camera on cell (x, y), keeping the zoom. */
  centerOn(x: number, y: number): void;
  /** Shows the placement preview, or hides it with `null`. */
  setGhost(ghost: Ghost | null): void;
  /** Flies the items a construction took from storage to its site. */
  showConstruction(paid: SimEventOf<"ConstructionPaid">): void;
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
  const nodeViews = new NodeViews(layers.nodes);
  const ghostLayer = layers.overlays.addChild(
    new Container({ label: "ghost", alpha: GHOST_ALPHA, visible: false }),
  );
  let ghostCard: Container | null = null;
  const ghostOutline = ghostLayer.addChild(new Graphics());
  let ghost: Ghost | null = null;
  const flights = new Flights(layers.overlays);
  /** The ghost as drawn: its card is rebuilt only when kind or resource change. */
  let drawnCard: string | null = null;
  let drawnValid: boolean | null = null;

  let drawnMap: object | null = null;
  /** The map the camera was last fitted to; a context restore keeps the view. */
  let fittedMap: object | null = null;
  let drawnRing = -1;
  let contextLost = false;

  const drawGhostLayer = () => {
    ghostLayer.visible = ghost !== null;
    if (!ghost) return;
    const { kind, resource, valid } = ghost;
    const look = `${kind}|${resource ?? ""}`;
    if (look !== drawnCard) {
      ghostCard?.destroy({ children: true });
      ghostCard = ghostLayer.addChildAt(drawNodeCard(kind, resource), 0);
      drawnCard = look;
      drawnValid = null;
    }
    if (valid !== drawnValid) {
      drawGhostOutline(ghostOutline, kind, valid);
      drawnValid = valid;
    }
    ghostLayer.position.set(ghost.x * CELL_PX, ghost.y * CELL_PX);
  };

  const rebuildMap = () => {
    const { map } = state;
    const bounds = revealedBounds(map);
    for (const layer of [layers.terrain, layers.deposits]) {
      for (const child of layer.removeChildren()) {
        child.destroy({ children: true });
      }
    }
    layers.terrain.addChild(drawTerrain(map, bounds));
    layers.deposits.addChild(drawDeposits(map, bounds));
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
    nodeViews.clear();
    flights.clear();
    drawnCard = null;
  });

  /** The centre of node `id`, in world units, if it still exists. */
  const centerOf = (id: NodeId) => {
    const node = state.nodes.get(id);
    if (!node) return null;
    const { x, y, w, h } = toWorld(nodeRect(node));
    return { x: x + w / 2, y: y + h / 2 };
  };

  return {
    frame() {
      if (contextLost) return;
      const { map } = state;
      camera.setViewport(app.screen.width, app.screen.height);
      if (drawnMap !== map || drawnRing !== map.revealedRing) rebuildMap();
      nodeViews.sync(state.nodes);
      drawGhostLayer();
      flights.update(performance.now());
      world.scale.set(camera.scale);
      world.position.set(camera.x, camera.y);
      applyLod(layers, camera.lod);
      app.render();
    },
    layers,
    centerOn(x, y) {
      camera.centerOn((x + 0.5) * CELL_PX, (y + 0.5) * CELL_PX);
    },
    setGhost(next) {
      ghost = next;
    },
    showConstruction({ site, draws }) {
      const to = centerOf(site);
      if (!to) return;
      const now = performance.now();
      draws.forEach(({ storage, item }, i) => {
        const from = centerOf(storage);
        if (!from) return;
        flights.launch(
          from,
          to,
          ITEM_COLOR[item],
          now + i * BUILD_FLIGHT_STAGGER_MS,
        );
      });
    },
  };
}
