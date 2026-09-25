import { Container, Graphics, type Application } from "pixi.js";
import type { SimEventOf } from "../sim/events";
import type { Rect } from "../sim/geometry/rect";
import type { GameState } from "../sim/state/gameState";
import type { EdgeId, NodeId, RailId } from "../sim/state/ids";
import { nodeRect } from "../sim/state/nodes";
import type { Deposit } from "../sim/state/map";
import { isShort } from "../sim/state/power";
import type { Camera } from "../input/camera";
import type { EdgePreview } from "../input/tools/connect";
import type { Ghost } from "../input/tools/place";
import { EdgePreviewView, EdgeViews } from "./edges";
import { Flights } from "./flights";
import { ItemViews } from "./items";
import { applyFocus, createLayers, type Focus, type Layers } from "./layers";
import { applyLod } from "./lod";
import {
  DepositLabels,
  drawDeposits,
  drawGrid,
  drawTerrain,
  revealedBounds,
} from "./mapView";
import {
  cardSide,
  drawGhostOutline,
  drawLiftOrigin,
  drawLiftShadow,
  drawNodeCard,
  drawSelection,
  mainResource,
  NodeViews,
} from "./nodes";
import { drawRailPorts, RailPortViews, RailViews } from "./rails";
import type { DeepReadonly } from "./readonly";
import { screenText } from "./text";
import { TrainViews } from "./trains";
import { coverageText, extractorRateText, formatGain } from "../ui/format";
import { strings } from "../ui/strings";
import {
  BUILD_FLIGHT_MS,
  BUILD_FLIGHT_STAGGER_MS,
  CELL_PX,
  GHOST_ALPHA,
  ITEM_COLOR,
  LIFT,
  TAP_FLIGHT_MS,
  toWorld,
  UNFOCUSED_ALPHA,
} from "./theme";

export interface Renderer {
  /** Draws one frame; `alpha` is the loop's interpolation factor. */
  frame(alpha: number): void;
  readonly layers: Layers;
  /** Centres the camera on cell (x, y), keeping the zoom. */
  centerOn(x: number, y: number): void;
  /** Centres the camera on node `id`; false if it no longer exists. */
  centerOnNode(id: NodeId): boolean;
  /** Shows the placement preview, or hides it with `null`. */
  setGhost(ghost: Ghost | null): void;
  /** Shows the edge being dragged, or hides it with `null`. */
  setEdgePreview(preview: EdgePreview | null): void;
  /** Highlights the edge whose menu is open, or none with `null`. */
  setSelectedEdge(id: EdgeId | null): void;
  /** Highlights the rail whose menu is open, or none with `null`. */
  setSelectedRail(id: RailId | null): void;
  /** Brings the factory or the rail layer into focus, dimming the other. */
  setFocus(focus: Focus): void;
  /** Highlights the node whose action bubble is open, or none with `null`. */
  setSelectedNode(id: NodeId | null): void;
  /**
   * Lifts the node being moved (FR134): its card leaves a dashed outline on
   * its cell, its edges fade and the grid brightens; `null` sets it down.
   */
  setMoving(id: NodeId | null): void;
  /**
   * Plays the lifted ghost's release: it settles where it is, or, with
   * `back`, flies back to the node's cell.
   */
  dropGhost(back: boolean): void;
  /** Flies the items a construction took from storage to its site. */
  showConstruction(paid: SimEventOf<"ConstructionPaid">): void;
  /** Pops the tapped cell and flies its item to the Core, both labelled. */
  showTap(tap: SimEventOf<"ManualTapped">): void;
  /**
   * Names the deposit under the mouse or the last tap, or none with `null`.
   * The closest zoom names every deposit already, so it shows only farther.
   */
  showDepositName(deposit: DeepReadonly<Deposit> | null): void;
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
  const railPortViews = new RailPortViews(layers.rails);
  const railViews = new RailViews(layers.rails);
  const trainViews = new TrainViews(layers.trains);
  let selectedRail: RailId | null = null;
  applyFocus(layers, "factory", UNFOCUSED_ALPHA);
  const edgeViews = new EdgeViews(layers.edges);
  const itemViews = new ItemViews(layers.items, app.renderer);
  const edgePreviewView = new EdgePreviewView(layers.overlays);
  let edgePreview: EdgePreview | null = null;
  let selectedEdge: EdgeId | null = null;
  let moving: NodeId | null = null;
  let selectedNode: NodeId | null = null;
  const selection = layers.overlays.addChild(
    new Graphics({ label: "selection", visible: false }),
  );
  /** The node the selection outline was drawn for; redrawn when it changes. */
  let drawnSelection: object | null = null;
  const liftOrigin = layers.overlays.addChild(
    new Graphics({ label: "lift-origin", visible: false }),
  );
  let drawnOrigin: object | null = null;
  const ghostLayer = layers.overlays.addChild(
    new Container({ label: "ghost", alpha: GHOST_ALPHA, visible: false }),
  );
  const liftShadow = ghostLayer.addChild(new Graphics({ visible: false }));
  let ghostCard: Container | null = null;
  const ghostOutline = ghostLayer.addChild(new Graphics());
  let ghost: Ghost | null = null;
  /** The released ghost's animation, which outlives the ghost itself. */
  let drop: {
    node: NodeId;
    back: boolean;
    start: number;
    from: { x: number; y: number };
  } | null = null;
  /** The brighter grid over the terrain while a node is lifted. */
  let liftGrid: Graphics | null = null;
  const flights = new Flights(layers.overlays);
  let depositLabels: DepositLabels | null = null;
  let namedDeposit: DeepReadonly<Deposit> | null = null;
  const depositName = layers.overlays.addChild(screenText("", 14));
  depositName.anchor.set(0.5, 1);
  depositName.visible = false;
  /** The ghost as drawn: its card is rebuilt only when kind or name change. */
  let drawnGhost: Ghost | null = null;
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
    const { kind, coverage, valid } = ghost;
    const lifted = moving !== null;
    if (ghost !== drawnGhost) {
      drawnGhost = ghost;
      // An Extractor's ghost previews what it would make, and how fast (FR30).
      const name = coverage
        ? `${coverageText(coverage)}${strings.menu.separator}${extractorRateText(coverage)}`
        : undefined;
      const look = `${kind}|${name ?? ""}`;
      if (look !== drawnCard) {
        ghostCard?.destroy({ children: true });
        const item = coverage && mainResource(coverage);
        ghostCard = ghostLayer.addChildAt(drawNodeCard(kind, item, name), 1);
        drawRailPorts(ghostCard.addChild(new Graphics()), kind);
        drawLiftShadow(liftShadow, kind);
        drawnCard = look;
        drawnValid = null;
      }
    }
    if (valid !== drawnValid) {
      drawGhostOutline(ghostOutline, kind, valid);
      drawnValid = valid;
    }
    // A lifted card grows about its centre and stays nearly opaque, over a
    // deeper shadow (FR134).
    const half = cardSide(kind) / 2;
    liftShadow.visible = lifted;
    ghostLayer.alpha = lifted ? LIFT.alpha : GHOST_ALPHA;
    ghostLayer.scale.set(lifted ? LIFT.scale : 1);
    ghostLayer.pivot.set(half);
    ghostLayer.position.set(ghost.x * CELL_PX + half, ghost.y * CELL_PX + half);
  };

  /**
   * Plays the release of a lifted ghost: a drop that fits shrinks back to
   * the card's size, a refused one flies back to the node's cell. The node's
   * card stays hidden until it ends.
   */
  const drawDrop = (now: number) => {
    if (!drop) return;
    const to = centerOf(drop.node);
    const t = (now - drop.start) / (drop.back ? LIFT.backMs : LIFT.settleMs);
    if (!to || t >= 1) {
      drop = null;
      ghostLayer.visible = false;
      return;
    }
    const ease = 1 - (1 - t) ** 3;
    ghostLayer.visible = true;
    ghostLayer.scale.set(LIFT.scale + (1 - LIFT.scale) * ease);
    ghostLayer.alpha = LIFT.alpha + (1 - LIFT.alpha) * ease;
    if (drop.back) {
      ghostLayer.position.set(
        drop.from.x + (to.x - drop.from.x) * ease,
        drop.from.y + (to.y - drop.from.y) * ease,
      );
    }
  };

  /**
   * The selected node's outline, and the dashed cell and brighter grid while
   * node `lifted` is held or dropping.
   */
  const drawNodeMarks = (lifted: NodeId | null) => {
    const selected =
      selectedNode === null ? undefined : state.nodes.get(selectedNode);
    selection.visible = selected !== undefined;
    if (selected && selected !== drawnSelection) {
      drawSelection(selection, selected.kind);
      selection.position.set(selected.x * CELL_PX, selected.y * CELL_PX);
      drawnSelection = selected;
    }
    const origin = lifted === null ? undefined : state.nodes.get(lifted);
    liftOrigin.visible = origin !== undefined && moving !== null;
    if (origin && origin !== drawnOrigin) {
      drawLiftOrigin(liftOrigin, origin.kind);
      liftOrigin.position.set(origin.x * CELL_PX, origin.y * CELL_PX);
      drawnOrigin = origin;
    }
    if (lifted !== null) liftGrid ??= drawLiftGrid();
    if (liftGrid) liftGrid.visible = lifted !== null;
  };

  /** Adds the brighter grid shown over the terrain while a node is lifted. */
  const drawLiftGrid = () =>
    layers.terrain.addChild(
      drawGrid(
        new Graphics({ label: "lift-grid" }),
        revealedBounds(state.map),
        LIFT.gridAlpha,
        2 * LIFT.gridAlpha,
      ),
    );

  const rebuildMap = () => {
    const { map } = state;
    const bounds = revealedBounds(map);
    for (const layer of [layers.terrain, layers.deposits]) {
      for (const child of layer.removeChildren()) {
        child.destroy({ children: true });
      }
    }
    layers.terrain.addChild(drawTerrain(map, bounds));
    // Drawn on the first lift after a rebuild: most maps never need it.
    liftGrid = null;
    layers.deposits.addChild(drawDeposits(map, bounds));
    depositLabels = new DepositLabels(map, bounds);
    depositLabels.hideCovered(state);
    layers.deposits.addChild(depositLabels.container);
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
    railPortViews.clear();
    railViews.clear();
    trainViews.clear();
    edgeViews.clear();
    itemViews.clear();
    flights.clear();
    drawnGhost = null;
    drawnCard = null;
    drawnSelection = null;
    drawnOrigin = null;
  });

  /** The centre of a rect of cells, in world units. */
  const rectCenter = (cells: Rect) => {
    const { x, y, w, h } = toWorld(cells);
    return { x: x + w / 2, y: y + h / 2 };
  };

  /** The centre of node `id`, in world units, if it still exists. */
  const centerOf = (id: NodeId) => {
    const node = state.nodes.get(id);
    if (!node) return null;
    return rectCenter(nodeRect(node));
  };

  return {
    frame(alpha) {
      if (contextLost) return;
      const { map } = state;
      const { width, height } = app.screen;
      camera.setViewport(width, height);
      if (drawnMap !== map || drawnRing !== map.revealedRing) rebuildMap();
      const { lod } = camera;
      const now = performance.now();
      const lifted = moving ?? drop?.node ?? null;
      if (nodeViews.sync(state.nodes, state.power.satisfaction, lifted, lod)) {
        depositLabels?.hideCovered(state);
      }
      if (depositLabels) depositLabels.container.visible = lod === "icons";
      depositName.visible = namedDeposit !== null && lod !== "icons";
      if (depositName.visible) depositName.scale.set(1 / camera.scale);
      railPortViews.sync(state.nodes, moving);
      railViews.sync(state.rails, selectedRail);
      trainViews.update(state.trains, state.nodes, alpha);
      edgeViews.sync(
        state.edges,
        state.nodes,
        selectedEdge,
        isShort(state.power),
        moving,
        lod,
      );
      itemViews.update(state.edges, edgeViews, alpha, lod, camera.viewRect());
      if (drop) drawDrop(now);
      else drawGhostLayer();
      drawNodeMarks(lifted);
      edgePreviewView.update(edgePreview, camera, width);
      flights.update(now, camera.scale);
      world.scale.set(camera.scale);
      world.position.set(camera.x, camera.y);
      applyLod(layers, lod);
      app.render();
    },
    layers,
    centerOn(x, y) {
      camera.centerOn((x + 0.5) * CELL_PX, (y + 0.5) * CELL_PX);
    },
    centerOnNode(id) {
      const center = centerOf(id);
      if (center) camera.centerOn(center.x, center.y);
      return center !== null;
    },
    setGhost(next) {
      ghost = next;
    },
    setEdgePreview(next) {
      edgePreview = next;
    },
    setSelectedEdge(id) {
      selectedEdge = id;
    },
    setSelectedRail(id) {
      selectedRail = id;
    },
    setFocus(focus) {
      applyFocus(layers, focus, UNFOCUSED_ALPHA);
    },
    setSelectedNode(id) {
      selectedNode = id;
    },
    setMoving(id) {
      moving = id;
      // A new lift cuts short the last drop's animation.
      if (id !== null) drop = null;
    },
    dropGhost(back) {
      if (!ghost || moving === null) return;
      // The release may have planned a new cell since the last frame.
      drawGhostLayer();
      drop = {
        node: moving,
        back,
        start: performance.now(),
        from: { x: ghostLayer.position.x, y: ghostLayer.position.y },
      };
    },
    showConstruction({ site, draws }) {
      const to = rectCenter(site);
      const now = performance.now();
      draws.forEach(({ storage, item }, i) => {
        const from = centerOf(storage);
        if (!from) return;
        flights.launch(
          from,
          to,
          ITEM_COLOR[item],
          now + i * BUILD_FLIGHT_STAGGER_MS,
          BUILD_FLIGHT_MS,
        );
      });
    },
    showTap({ x, y, item, count, core }) {
      const to = centerOf(core);
      if (!to) return;
      const from = rectCenter({ x, y, w: 1, h: 1 });
      const now = performance.now();
      const color = ITEM_COLOR[item];
      const label = formatGain(count, item);
      flights.pop(from, color, now);
      flights.launch(from, to, color, now, TAP_FLIGHT_MS, label);
      flights.pop(to, color, now + TAP_FLIGHT_MS, label);
    },
    showDepositName(deposit) {
      namedDeposit = deposit;
      if (!deposit) return;
      const { x, y, w } = toWorld(deposit);
      depositName.text = strings.items[deposit.resource];
      depositName.position.set(x + w / 2, y);
    },
  };
}
