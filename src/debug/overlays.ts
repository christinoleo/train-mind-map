import { Container, Graphics } from "pixi.js";
import { MAP_GEN } from "../data/mapgen";
import { ringRect } from "../sim/state/map";
import type { DeepReadonly } from "../render/readonly";
import { CELL_PX, RESOURCE_STYLE, toWorld } from "../render/theme";
import { buildPlanarIndex } from "../sim/geometry/planar";
import type { GameState } from "../sim/state/gameState";

type StateView = DeepReadonly<GameState>;

/**
 * A debug drawing over the map. Later tasks register theirs (hash buckets,
 * power meshes, rail reservations) through `OverlayManager.register`.
 */
export interface Overlay {
  id: string;
  label: string;
  draw(state: StateView): Container;
  /** Redraw on every tick too, for overlays of what commands change. */
  live?: boolean;
}

export interface OverlayEntry {
  overlay: Overlay;
  enabled: boolean;
  view: Container | null;
}

/**
 * Draws the enabled overlays into the overlays layer. An overlay is redrawn
 * when it is switched on and whenever the map or its revealed ring changes.
 */
export class OverlayManager {
  private readonly entries = new Map<string, OverlayEntry>();
  private drawnMap: StateView["map"] | null = null;
  private drawnRing = -1;
  private drawnTick = -1;

  constructor(
    private readonly layer: Container,
    private readonly state: StateView,
  ) {}

  register(overlay: Overlay): void {
    if (this.entries.has(overlay.id)) {
      throw new Error(`overlay ${overlay.id} is already registered`);
    }
    this.entries.set(overlay.id, { overlay, enabled: false, view: null });
  }

  list(): readonly Readonly<OverlayEntry>[] {
    return [...this.entries.values()];
  }

  setEnabled(id: string, enabled: boolean): void {
    const entry = this.entries.get(id);
    if (!entry) throw new Error(`unknown overlay ${id}`);
    entry.enabled = enabled;
    if (enabled) this.redraw(entry);
    else this.clear(entry);
  }

  /** Redraws the enabled overlays on the next `refresh`, as after a context loss. */
  invalidate(): void {
    this.drawnMap = null;
  }

  /**
   * Call once a frame: redraws the enabled overlays if the map changed, and
   * the live ones if the simulation ticked.
   */
  refresh(): void {
    const { map, tick } = this.state;
    const mapChanged =
      this.drawnMap !== map || this.drawnRing !== map.revealedRing;
    const ticked = this.drawnTick !== tick;
    this.drawnMap = map;
    this.drawnRing = map.revealedRing;
    this.drawnTick = tick;
    for (const entry of this.entries.values()) {
      if (entry.enabled && (mapChanged || (ticked && entry.overlay.live))) {
        this.redraw(entry);
      }
    }
  }

  private redraw(entry: OverlayEntry): void {
    this.clear(entry);
    entry.view = this.layer.addChild(entry.overlay.draw(this.state));
  }

  private clear(entry: OverlayEntry): void {
    entry.view?.destroy({ children: true });
    entry.view = null;
  }
}

/**
 * Where map generation places deposits: the square boundary of each deposit
 * ring, and the guarantee radii around the Core (starter resources within
 * `starterDistance`, oil beyond `oilMinDistance`).
 */
export function drawCoreRings(state: StateView): Container {
  const g = new Graphics({ label: "overlay:core-rings" });
  for (let ring = 0; ring < MAP_GEN.rings.length; ring++) {
    const r = toWorld(ringRect(ring));
    g.rect(r.x, r.y, r.w, r.h);
  }
  g.stroke({ color: 0xffffff, alpha: 0.6, width: 2, pixelLine: true });

  const radii = [
    { cells: MAP_GEN.starterDistance, color: RESOURCE_STYLE.coal.color },
    {
      cells: MAP_GEN.oilMinDistance,
      color: RESOURCE_STYLE["crude-oil"].color,
    },
  ];
  // Distances are measured from the Core's edge, so each radius is the Core
  // grown by that distance with rounded corners.
  const core = toWorld(state.map.core);
  for (const { cells, color } of radii) {
    const d = cells * CELL_PX;
    g.roundRect(core.x - d, core.y - d, core.w + 2 * d, core.h + 2 * d, d);
    g.stroke({ color, width: 3 });
  }
  return g;
}

/**
 * The spatial hash of the factory layer (FR157): every bucket that holds
 * water, a node or an edge, shaded by how many it holds.
 */
export function drawHashBuckets(state: StateView): Container {
  const g = new Graphics({ label: "overlay:hash-buckets" });
  const index = buildPlanarIndex(state as GameState);
  for (const { rect, count } of index.hash.occupied()) {
    const r = toWorld(rect);
    g.rect(r.x, r.y, r.w, r.h)
      .fill({ color: 0x4fc3f7, alpha: Math.min(0.5, 0.04 * count) })
      .stroke({ color: 0x4fc3f7, alpha: 0.7, width: 1, pixelLine: true });
  }
  return g;
}
