import {
  Container,
  Graphics,
  Particle,
  ParticleContainer,
  Rectangle,
  Texture,
  type Renderer,
} from "pixi.js";
import { ITEMS, type ItemId } from "../data/items";
import type { Lod } from "../input/camera";
import type { Point } from "../sim/geometry/planar";
import { overlaps, type Rect } from "../sim/geometry/rect";
import { edgeUnits } from "../sim/state/edges";
import type { Edge } from "../sim/state/gameState";
import type { EdgeId } from "../sim/state/ids";
import { drawGlyph } from "./mapView";
import { pointAt, type Polyline } from "./polyline";
import type { DeepReadonly } from "./readonly";
import { CELL_PX, ITEM_COLOR, ITEM_STYLE, PALETTE } from "./theme";

/** Side of one atlas frame, in texture pixels. */
const FRAME_PX = 48;
/** Side of an item icon on the map, in world units. */
const ICON_SIDE = CELL_PX * 0.6;
/** A dot at the medium level of detail is smaller than an icon. */
const DOT_SCALE = 0.55;

/** The item glyphs, white so a tint colours them, and the plain dot. */
interface Atlas {
  source: Texture;
  dot: Texture;
  glyphs: Record<ItemId, Texture>;
}

/**
 * Draws every glyph and the dot side by side into one texture, since the
 * particles of one container share a texture source. Each glyph is white
 * with a dark rim, so a particle's tint gives its fill the item's colour.
 */
function buildAtlas(renderer: Renderer): Atlas {
  const g = new Graphics();
  const r = FRAME_PX * 0.32;
  const cells = [null, ...ITEMS];
  cells.forEach((item, i) => {
    const cx = (i + 0.5) * FRAME_PX;
    const cy = FRAME_PX / 2;
    if (item === null) g.circle(cx, cy, r);
    else drawGlyph(g, ITEM_STYLE[item].shape, cx, cy, r);
    g.fill(0xffffff).stroke({ color: PALETTE.shadow, alpha: 0.6, width: 3 });
  });
  const frame = new Rectangle(0, 0, cells.length * FRAME_PX, FRAME_PX);
  const source = renderer.generateTexture({ target: g, frame });
  g.destroy();
  const at = (i: number) =>
    new Texture({
      source: source.source,
      frame: new Rectangle(i * FRAME_PX, 0, FRAME_PX, FRAME_PX),
    });
  const glyphs = Object.fromEntries(
    ITEMS.map((item, i) => [item, at(i + 1)]),
  ) as Record<ItemId, Texture>;
  return { source, dot: at(0), glyphs };
}

/**
 * Every item in transit (FR147), in one `ParticleContainer` drawn in a single
 * call. Each frame it places the items of the edges on screen, between
 * their positions at the last two ticks, so they glide at any frame rate.
 * The medium level of detail shows coloured dots; the near level each item's
 * glyph, whose shape tells items apart without their colour (FR150).
 */
export class ItemViews {
  private readonly particles: ParticleContainer;
  private readonly pool: Particle[] = [];
  private atlas: Atlas | null = null;
  private readonly at: Point = { x: 0, y: 0 };

  constructor(
    layer: Container,
    private readonly renderer: Renderer,
  ) {
    this.particles = layer.addChild(
      new ParticleContainer({
        label: "items",
        dynamicProperties: {
          position: true,
          uvs: true,
          color: true,
          vertex: true,
        },
      }),
    );
  }

  /**
   * Draws the items of `edges` inside `view`, a rect in world units, at
   * `alpha` of the way from the last tick to the next. `lines.lineOf` gives
   * an edge's drawn line, or `undefined` while it is not drawn.
   */
  update(
    edges: ReadonlyMap<EdgeId, DeepReadonly<Edge>>,
    lines: { lineOf(id: EdgeId): Polyline | undefined },
    alpha: number,
    lod: Lod,
    view: Rect,
  ) {
    if (lod === "overview") return;
    if (!this.atlas) {
      this.atlas = buildAtlas(this.renderer);
      // The container keeps the texture it first drew with; a rebuilt atlas
      // after a context loss must replace it.
      this.particles.texture = this.atlas.dot;
    }
    const { dot, glyphs } = this.atlas;
    const icons = lod === "icons";
    const scale = (ICON_SIDE / FRAME_PX) * (icons ? 1 : DOT_SCALE);
    const { at, pool } = this;
    let n = 0;
    for (const [id, edge] of edges) {
      if (edge.items.length === 0) continue;
      const line = lines.lineOf(id);
      if (!line || !overlaps(line.bounds, view)) continue;
      const toLine = line.length / edgeUnits(edge);
      let hint = 1;
      for (const { item, pos, prevPos } of edge.items) {
        const d = (prevPos + (pos - prevPos) * alpha) * toLine;
        hint = pointAt(line, d, at, hint);
        const p = (pool[n] ??= new Particle({
          texture: dot,
          anchorX: 0.5,
          anchorY: 0.5,
        }));
        p.texture = icons ? glyphs[item] : dot;
        p.x = at.x;
        p.y = at.y;
        p.scaleX = p.scaleY = scale;
        p.tint = ITEM_COLOR[item];
        n++;
      }
    }
    const children = this.particles.particleChildren;
    if (children.length !== n) {
      children.length = 0;
      for (let i = 0; i < n; i++) children.push(pool[i]);
      this.particles.update();
    }
  }

  /**
   * Drops the atlas, so the next `update` builds it again: after a context
   * loss its texture is gone. The lost context took its GPU memory with it,
   * and destroying the source here would pull it from under the shader that
   * still binds it, so it is only let go.
   */
  clear() {
    this.atlas = null;
  }
}
