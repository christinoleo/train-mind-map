// Scene layout for the rendering stress test: polyline edges, the items that
// move along them and the looping train paths. Pure and seeded, so every
// device measures the same scene.

export interface Point {
  x: number;
  y: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** A polyline in cell coordinates, with its cumulative segment lengths. */
export interface Path {
  points: Point[];
  /** `lengths[i]` is the distance from `points[0]` to `points[i]`. */
  lengths: number[];
  length: number;
  bounds: Bounds;
}

export interface StressScene {
  edges: Path[];
  /** Closed loops: the last point repeats the first. */
  trainPaths: Path[];
  /** Width and height of the square world, in cells. */
  worldCells: number;
}

export const WORLD_CELLS = 240;
export const EDGE_COUNT = 200;
export const TRAIN_PATH_COUNT = 20;

/** Mulberry32: a small seeded generator returning floats in [0, 1). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makePath(points: Point[]): Path {
  const lengths = [0];
  const bounds: Bounds = {
    minX: points[0].x,
    minY: points[0].y,
    maxX: points[0].x,
    maxY: points[0].y,
  };
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    lengths.push(lengths[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
    bounds.minX = Math.min(bounds.minX, b.x);
    bounds.minY = Math.min(bounds.minY, b.y);
    bounds.maxX = Math.max(bounds.maxX, b.x);
    bounds.maxY = Math.max(bounds.maxY, b.y);
  }
  return { points, lengths, length: lengths[lengths.length - 1], bounds };
}

/**
 * Writes the point at `distance` along `path` into `out`. The distance wraps
 * around the path length, so items and trains loop forever.
 */
export function pointAt(path: Path, distance: number, out: Point): Point {
  const { points, lengths, length } = path;
  let d = distance % length;
  if (d < 0) d += length;
  // Paths have a handful of segments, so a linear scan beats a binary search.
  let i = 1;
  while (i < lengths.length - 1 && lengths[i] < d) i++;
  const a = points[i - 1];
  const b = points[i];
  const span = lengths[i] - lengths[i - 1];
  const t = span > 0 ? (d - lengths[i - 1]) / span : 0;
  out.x = a.x + (b.x - a.x) * t;
  out.y = a.y + (b.y - a.y) * t;
  return out;
}

function randInt(rand: () => number, min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1));
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** An axis-aligned polyline of 2 to 4 segments, like a factory edge. */
function makeEdge(rand: () => number, world: number): Path {
  const points: Point[] = [
    { x: randInt(rand, 4, world - 4), y: randInt(rand, 4, world - 4) },
  ];
  const segments = randInt(rand, 2, 4);
  let horizontal = rand() < 0.5;
  for (let s = 0; s < segments; s++) {
    const last = points[points.length - 1];
    const step = randInt(rand, 4, 14) * (rand() < 0.5 ? -1 : 1);
    points.push(
      horizontal
        ? { x: clamp(last.x + step, 0, world), y: last.y }
        : { x: last.x, y: clamp(last.y + step, 0, world) },
    );
    horizontal = !horizontal;
  }
  return makePath(points);
}

/** A closed rectangular loop, longer than any edge, for one train. */
function makeTrainPath(rand: () => number, world: number): Path {
  const w = randInt(rand, 30, 90);
  const h = randInt(rand, 30, 90);
  const x = randInt(rand, 0, world - w);
  const y = randInt(rand, 0, world - h);
  return makePath([
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
    { x, y },
  ]);
}

export function generateScene(seed: number): StressScene {
  const rand = seededRandom(seed);
  const edges: Path[] = [];
  for (let i = 0; i < EDGE_COUNT; i++) edges.push(makeEdge(rand, WORLD_CELLS));
  const trainPaths: Path[] = [];
  for (let i = 0; i < TRAIN_PATH_COUNT; i++) {
    trainPaths.push(makeTrainPath(rand, WORLD_CELLS));
  }
  return { edges, trainPaths, worldCells: WORLD_CELLS };
}

export function intersects(a: Bounds, b: Bounds): boolean {
  return (
    a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY
  );
}
