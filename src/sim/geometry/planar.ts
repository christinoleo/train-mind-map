// The planar rule (ADR-0004): an edge never crosses another edge, never passes
// through a node and never crosses water. Edges are polylines whose vertices
// are integer cells, so every test here is exact integer arithmetic.

import { HASH_BUCKET_CELLS } from "../../config/constants";
import { fail, ok, type Result } from "../result";
import type { GameState } from "../state/gameState";
import type { EdgeId, NodeId } from "../state/ids";
import { MAP_RECT, waterRuns, type GameMap } from "../state/map";
import { nodeRect } from "../state/nodes";
import { containsCell, type Rect } from "./rect";
import { SpatialHash } from "./spatialHash";

/** A cell, as integer coordinates. */
export interface Point {
  x: number;
  y: number;
}

/** True when `path` runs from `start` to `end`. */
export function joins(
  path: readonly Point[],
  start: Point,
  end: Point,
): boolean {
  const first = path[0];
  const last = path[path.length - 1];
  return (
    first.x === start.x &&
    first.y === start.y &&
    last.x === end.x &&
    last.y === end.y
  );
}

/** Sign of the turn a → b → c: 1 counter-clockwise, -1 clockwise, 0 collinear. */
export function orientation(a: Point, b: Point, c: Point): number {
  return Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
}

/** True when `p` lies on the closed segment a–b. */
export function pointOnSegment(p: Point, a: Point, b: Point): boolean {
  return (
    orientation(a, b, p) === 0 &&
    p.x >= Math.min(a.x, b.x) &&
    p.x <= Math.max(a.x, b.x) &&
    p.y >= Math.min(a.y, b.y) &&
    p.y <= Math.max(a.y, b.y)
  );
}

/**
 * True when the closed segments a–b and c–d share any point: a proper
 * crossing, a touch at a vertex, or a collinear overlap.
 */
export function segmentsIntersect(
  a: Point,
  b: Point,
  c: Point,
  d: Point,
): boolean {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  return (
    (o1 === 0 && pointOnSegment(c, a, b)) ||
    (o2 === 0 && pointOnSegment(d, a, b)) ||
    (o3 === 0 && pointOnSegment(a, c, d)) ||
    (o4 === 0 && pointOnSegment(b, c, d))
  );
}

/** True when the segment a–b passes through any cell of `rect`. */
export function segmentHitsRect(a: Point, b: Point, rect: Rect): boolean {
  if (containsCell(rect, a.x, a.y) || containsCell(rect, b.x, b.y)) return true;
  const x0 = rect.x;
  const y0 = rect.y;
  const x1 = rect.x + rect.w - 1;
  const y1 = rect.y + rect.h - 1;
  const c00 = { x: x0, y: y0 };
  const c10 = { x: x1, y: y0 };
  const c11 = { x: x1, y: y1 };
  const c01 = { x: x0, y: y1 };
  return (
    segmentsIntersect(a, b, c00, c10) ||
    segmentsIntersect(a, b, c10, c11) ||
    segmentsIntersect(a, b, c11, c01) ||
    segmentsIntersect(a, b, c01, c00)
  );
}

/** The segments of a polyline; a single cell is one zero-length segment. */
export function segments(path: readonly Point[]): [Point, Point][] {
  if (path.length === 1) return [[path[0], path[0]]];
  return path.slice(1).map((b, i) => [path[i], b]);
}

/** The sum of a polyline's segment lengths, in cells, unrounded. */
export function lineLength(path: readonly Point[]): number {
  let sum = 0;
  for (let i = 1; i < path.length; i++) {
    const dx = path[i].x - path[i - 1].x;
    const dy = path[i].y - path[i - 1].y;
    // Math.sqrt is exactly rounded on every engine, unlike Math.hypot.
    sum += Math.sqrt(dx * dx + dy * dy);
  }
  return sum;
}

/** The sum of a polyline's segment lengths, in cells, rounded up. */
export function polylineLength(path: readonly Point[]): number {
  return Math.ceil(lineLength(path));
}

function segmentBounds(a: Point, b: Point): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.abs(b.x - a.x) + 1, h: Math.abs(b.y - a.y) + 1 };
}

/** What the planar index holds: water, node footprints and edge segments. */
export type Obstacle =
  | { kind: "water"; rect: Rect }
  | { kind: "node"; id: NodeId; rect: Rect }
  | { kind: "edge"; id: EdgeId; a: Point; b: Point };

function obstacleBounds(o: Obstacle): Rect {
  return o.kind === "edge" ? segmentBounds(o.a, o.b) : o.rect;
}

/**
 * The factory layer's spatial index (FR157): water, nodes and edges in a
 * `SpatialHash`, plus a per-bucket cache of which cells are blocked, so the
 * router tests a cell in constant time. It is derived from the game state and
 * never saved.
 */
export class PlanarIndex {
  readonly hash = new SpatialHash<Obstacle>(HASH_BUCKET_CELLS);
  private readonly nodes = new Map<NodeId, Obstacle>();
  private readonly edges = new Map<EdgeId, Obstacle[]>();
  /** Blocked cells of each bucket, row by row, built on first use. */
  private readonly blockedCache = new Map<number, Uint8Array>();

  /** Indexes the water of `map`, one rect per horizontal run of water cells. */
  constructor(map: GameMap) {
    for (const rect of waterRuns(map, MAP_RECT)) {
      this.insert({ kind: "water", rect });
    }
  }

  addNode(id: NodeId, rect: Rect): void {
    if (this.nodes.has(id)) throw new Error(`node ${id} is already indexed`);
    const obstacle: Obstacle = { kind: "node", id, rect };
    this.nodes.set(id, obstacle);
    this.insert(obstacle);
  }

  removeNode(id: NodeId): void {
    const obstacle = this.nodes.get(id);
    if (!obstacle) throw new Error(`node ${id} is not indexed`);
    this.nodes.delete(id);
    this.remove(obstacle);
  }

  addEdge(id: EdgeId, path: readonly Point[]): void {
    if (this.edges.has(id)) throw new Error(`edge ${id} is already indexed`);
    const parts = segments(path).map(([a, b]): Obstacle => ({
      kind: "edge",
      id,
      a,
      b,
    }));
    this.edges.set(id, parts);
    for (const part of parts) this.insert(part);
  }

  removeEdge(id: EdgeId): void {
    const parts = this.edges.get(id);
    if (!parts) throw new Error(`edge ${id} is not indexed`);
    this.edges.delete(id);
    for (const part of parts) this.remove(part);
  }

  /** True when a node, water or an edge occupies cell (x, y). */
  isBlocked(x: number, y: number): boolean {
    const size = HASH_BUCKET_CELLS;
    const blocked = this.blockedBucket(this.hash.keyAt(x, y));
    return blocked[(y % size) * size + (x % size)] === 1;
  }

  /** What occupies cell (x, y), if anything. */
  obstacleAt(x: number, y: number): Obstacle | undefined {
    const cell = { x, y };
    return this.hash
      .query({ x, y, w: 1, h: 1 })
      .find((o) =>
        o.kind === "edge"
          ? pointOnSegment(cell, o.a, o.b)
          : containsCell(o.rect, x, y),
      );
  }

  /**
   * Which cells of `rect` a node, water or an edge occupies: 1 where one
   * does, row by row. It reads each bucket once, for the router.
   */
  blockedIn(rect: Rect): Uint8Array {
    const size = HASH_BUCKET_CELLS;
    const out = new Uint8Array(rect.w * rect.h);
    for (let y = rect.y; y < rect.y + rect.h; y++) {
      for (let x = rect.x; x < rect.x + rect.w;) {
        const blocked = this.blockedBucket(this.hash.keyAt(x, y));
        const row = (y % size) * size;
        // The rest of this bucket's row, at most.
        const end = Math.min(rect.x + rect.w, x - (x % size) + size);
        for (; x < end; x++) {
          out[(y - rect.y) * rect.w + (x - rect.x)] = blocked[row + (x % size)];
        }
      }
    }
    return out;
  }

  /**
   * Checks a polyline against the planar rule: it may not cross water, pass
   * through a node or touch another edge.
   */
  checkPath(path: readonly Point[]): Result {
    for (const [a, b] of segments(path)) {
      for (const o of this.hash.query(segmentBounds(a, b))) {
        if (o.kind === "edge") {
          if (segmentsIntersect(a, b, o.a, o.b)) return fail("crosses_edge");
        } else if (segmentHitsRect(a, b, o.rect)) {
          return fail(o.kind === "node" ? "crosses_node" : "on_water");
        }
      }
    }
    return ok();
  }

  private insert(obstacle: Obstacle): void {
    this.invalidate(this.hash.insert(obstacle, obstacleBounds(obstacle)));
  }

  private remove(obstacle: Obstacle): void {
    this.invalidate(this.hash.remove(obstacle));
  }

  private invalidate(keys: readonly number[]): void {
    for (const key of keys) this.blockedCache.delete(key);
  }

  private blockedBucket(key: number): Uint8Array {
    let blocked = this.blockedCache.get(key);
    if (!blocked) {
      blocked = this.rasterize(key);
      this.blockedCache.set(key, blocked);
    }
    return blocked;
  }

  private rasterize(key: number): Uint8Array {
    const size = HASH_BUCKET_CELLS;
    const r = this.hash.bucketRect(key);
    const blocked = new Uint8Array(size * size);
    for (const o of this.hash.bucket(key) ?? []) {
      const b = obstacleBounds(o);
      const x0 = Math.max(b.x, r.x);
      const x1 = Math.min(b.x + b.w, r.x + size);
      const y0 = Math.max(b.y, r.y);
      const y1 = Math.min(b.y + b.h, r.y + size);
      // Water and nodes fill their clipped bounds; an edge only its cells.
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          if (o.kind !== "edge" || pointOnSegment({ x, y }, o.a, o.b)) {
            blocked[(y - r.y) * size + (x - r.x)] = 1;
          }
        }
      }
    }
    return blocked;
  }
}

/** The planar index of a game: its water, nodes and edges. */
export function buildPlanarIndex(state: Readonly<GameState>): PlanarIndex {
  const index = new PlanarIndex(state.map);
  for (const node of state.nodes.values()) {
    index.addNode(node.id, nodeRect(node));
  }
  for (const edge of state.edges.values()) index.addEdge(edge.id, edge.path);
  return index;
}
