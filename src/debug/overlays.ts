import { Container, Graphics } from "pixi.js";
import { MAP_GEN } from "../data/mapgen";
import { ringRect } from "../sim/state/map";
import type { DeepReadonly } from "../render/readonly";
import { CELL_PX, ITEM_STYLE, toWorld } from "../render/theme";
import { buildPlanarIndex } from "../sim/geometry/planar";
import type { GameState } from "../sim/state/gameState";
import { nodeRect } from "../sim/state/nodes";
import { strokeLine } from "../render/edges";
import { offsetLine } from "../render/rails";
import {
  parsePlatformKey,
  parseSegmentKey,
  segmentOf,
} from "../sim/rail/segments";

type StateView = DeepReadonly<GameState>;

/**
 * A debug drawing over the map. Later tasks register theirs (hash buckets,
 * rail reservations) through `OverlayManager.register`.
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
    { cells: MAP_GEN.starterDistance, color: ITEM_STYLE.coal.color },
    {
      cells: MAP_GEN.oilMinDistance,
      color: ITEM_STYLE["crude-oil"].color,
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

/** Distinct hues for the trains' reservations; they repeat past the eighth. */
const TRAIN_COLORS = [
  0xff6b6b, 0x4fc3f7, 0xffd54f, 0x81c784, 0xba68c8, 0xff8a65, 0x4db6ac,
  0xf06292,
];

/**
 * The reservation table (FR157): each reserved Segment drawn over its track,
 * right of the way it runs, and each reserved platform outlined, in the
 * colour of the train that holds it.
 */
export function drawReservations(state: StateView): Container {
  const g = new Graphics({ label: "overlay:reservations" });
  for (const [key, train] of state.reservations) {
    const color = TRAIN_COLORS[(train - 1) % TRAIN_COLORS.length];
    const segment = parseSegmentKey(key);
    const rail = segment && state.rails.get(segment.rail);
    if (segment && rail) {
      const line = segmentOf(rail, segment.forward).line.map((p) => ({
        x: p.x * CELL_PX,
        y: p.y * CELL_PX,
      }));
      // A negative offset is right of the way it runs, onto its own track.
      strokeLine(
        g,
        offsetLine(line, -0.3 * CELL_PX),
        color,
        0.9,
        CELL_PX * 0.2,
      );
      continue;
    }
    const station = parsePlatformKey(key);
    const node = station !== null ? state.nodes.get(station) : undefined;
    if (!node) continue;
    const r = toWorld(nodeRect(node));
    g.rect(r.x, r.y, r.w, r.h)
      .fill({ color, alpha: 0.25 })
      .stroke({ color, width: 3 });
  }
  return g;
}
