import {
  Application,
  Container,
  CullerPlugin,
  extensions,
  Graphics,
  Particle,
  ParticleContainer,
  Rectangle,
  RendererType,
  Sprite,
  Texture,
  UPDATE_PRIORITY,
  type WebGLRenderer,
} from "pixi.js";
import { appOptions } from "../../render/app";
import { strings } from "../../ui/strings";
import { StressCamera } from "./camera";
import {
  FrameWindow,
  round,
  type ContextLoss,
  type StressResults,
} from "./metrics";
import { createPanel, type StressSettings } from "./panel";
import {
  generateScene,
  intersects,
  pointAt,
  seededRandom,
  type Bounds,
  type Path,
  type Point,
} from "./scene";

// Rendering stress test (wayfinder ticket #3): items on edges through a
// ParticleContainer, trains as sprites, culling, a far-zoom LOD and forced
// WebGL context loss, with the numbers the designer copies from real phones.

const CELL = 16;
const ITEM_SPEED_CELLS = 3;
const TRAIN_SPEED_CELLS = 6;
const CAR_SPACING_CELLS = 1.6;
/** Below this camera scale, with LOD on, edges become coloured strokes. */
const LOD_SCALE = 0.35;
const CONTEXT_RESTORE_DELAY_MS = 1000;
const SEED = 17;
const ITEM_COLORS = [0xe8a33d, 0xc0c8d0, 0xd06a3a, 0x7fc75a];

extensions.add(CullerPlugin);

const app = new Application();
await app.init(appOptions());
// Pixi falls back to WebGPU or Canvas without WebGL, and this page measures
// WebGL only.
if (app.renderer.type !== RendererType.WEBGL) {
  document.body.textContent = strings.stress.noWebgl;
  throw new Error("stress test needs WebGL");
}
const renderer = app.renderer as WebGLRenderer;
document.getElementById("pixi-container")!.appendChild(app.canvas);

// One canvas-backed atlas for every item and train texture. A canvas source is
// re-uploaded after a context loss, unlike a RenderTexture.
function buildAtlas() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 16;
  const ctx = canvas.getContext("2d")!;
  ITEM_COLORS.forEach((color, i) => {
    ctx.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
    ctx.beginPath();
    ctx.arc(i * 16 + 8, 8, 6, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = "#e04848";
  ctx.fillRect(64, 3, 22, 10);
  ctx.fillStyle = "#8894a8";
  ctx.fillRect(96, 4, 20, 8);
  const source = Texture.from(canvas).source;
  const frame = (x: number, y: number, w: number, h: number) =>
    new Texture({ source, frame: new Rectangle(x, y, w, h) });
  return {
    items: ITEM_COLORS.map((_, i) => frame(i * 16, 0, 16, 16)),
    locomotive: frame(64, 3, 22, 10),
    wagon: frame(96, 4, 20, 8),
  };
}

const atlas = buildAtlas();
const scene = generateScene(SEED);
const worldPx = scene.worldCells * CELL;

const world = new Container();
app.stage.addChild(world);

const edgeLayer = new Container();
const lodLayer = new Container();
const itemLayer = new ParticleContainer({
  dynamicProperties: { position: true },
  texture: atlas.items[0],
});
// The particles are culled by hand per edge below; the container itself
// always spans the world.
itemLayer.boundsArea = new Rectangle(0, 0, worldPx, worldPx);
const trainLayer = new Container();
world.addChild(edgeLayer, lodLayer, itemLayer, trainLayer);

function strokeFor(path: Path, width: number, color: number): Graphics {
  const g = new Graphics();
  const [first, ...rest] = path.points;
  g.moveTo(first.x * CELL, first.y * CELL);
  for (const p of rest) g.lineTo(p.x * CELL, p.y * CELL);
  g.stroke({ width, color, cap: "round", join: "round" });
  g.cullable = true;
  return g;
}

scene.edges.forEach((edge, i) => {
  edgeLayer.addChild(strokeFor(edge, 4, 0x2c4a70));
  lodLayer.addChild(
    strokeFor(edge, CELL * 2, ITEM_COLORS[i % ITEM_COLORS.length]),
  );
});

// Items, grouped by edge so culling works per edge AABB.
let edgeItems: { particle: Particle; offset: number }[][] = [];

function buildItems(count: number) {
  const rand = seededRandom(SEED + count);
  edgeItems = scene.edges.map(() => []);
  for (let i = 0; i < count; i++) {
    const edgeIndex = i % scene.edges.length;
    const edge = scene.edges[edgeIndex];
    const particle = new Particle({
      texture: atlas.items[edgeIndex % atlas.items.length],
      anchorX: 0.5,
      anchorY: 0.5,
    });
    edgeItems[edgeIndex].push({ particle, offset: rand() * edge.length });
  }
  visibleEdgesDirty = true;
}

interface Train {
  path: Path;
  offset: number;
  cars: Sprite[];
}

function buildTrains(): Train[] {
  const rand = seededRandom(SEED + 1);
  return scene.trainPaths.map((path) => {
    const wagons = 2 + Math.floor(rand() * 3);
    const cars = Array.from({ length: 1 + wagons }, (_, i) => {
      const texture = i === 0 ? atlas.locomotive : atlas.wagon;
      const sprite = new Sprite({ texture, anchor: 0.5 });
      sprite.cullable = true;
      trainLayer.addChild(sprite);
      return sprite;
    });
    return { path, offset: rand() * path.length, cars };
  });
}

const trains = buildTrains();

const settings: StressSettings = { items: 1000, trains: 20, lod: false };
const frames = new FrameWindow(600);
const updateTimes = new FrameWindow(600);
const contextLosses: ContextLoss[] = [];
let lostAt = 0;
let forcedLoss = false;
/** Frames left out of the stats after a settings change or a context loss. */
let skipFrames = 0;
let elapsedS = 0;
let visibleItems = 0;

const camera = new StressCamera(world, app.canvas);
camera.fit(worldPx, worldPx, app.screen.width, app.screen.height);

const view: Bounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
const point: Point = { x: 0, y: 0 };
const ahead: Point = { x: 0, y: 0 };
const visibleEdges: number[] = [];
const nextVisibleEdges: number[] = [];
let visibleEdgesDirty = true;

function sameEdges(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function updateItems() {
  // View bounds in cells, to test against the edges' cell-space bounds.
  camera.viewBounds(app.screen.width, app.screen.height, view);
  view.minX /= CELL;
  view.minY /= CELL;
  view.maxX /= CELL;
  view.maxY /= CELL;
  nextVisibleEdges.length = 0;
  for (let i = 0; i < scene.edges.length; i++) {
    if (intersects(scene.edges[i].bounds, view)) nextVisibleEdges.push(i);
  }
  const children = itemLayer.particleChildren;
  if (visibleEdgesDirty || !sameEdges(nextVisibleEdges, visibleEdges)) {
    visibleEdgesDirty = false;
    visibleEdges.length = 0;
    visibleEdges.push(...nextVisibleEdges);
    children.length = 0;
    for (const i of visibleEdges) {
      for (const item of edgeItems[i]) children.push(item.particle);
    }
    itemLayer.update();
  }
  visibleItems = children.length;
  const travelled = elapsedS * ITEM_SPEED_CELLS;
  for (const i of visibleEdges) {
    const edge = scene.edges[i];
    for (const item of edgeItems[i]) {
      pointAt(edge, item.offset + travelled, point);
      item.particle.x = point.x * CELL;
      item.particle.y = point.y * CELL;
    }
  }
}

function updateTrains() {
  const travelled = elapsedS * TRAIN_SPEED_CELLS;
  for (const train of trains) {
    for (let i = 0; i < train.cars.length; i++) {
      const d = train.offset + travelled - i * CAR_SPACING_CELLS;
      pointAt(train.path, d, point);
      pointAt(train.path, d + 0.1, ahead);
      train.cars[i].position.set(point.x * CELL, point.y * CELL);
      train.cars[i].rotation = Math.atan2(ahead.y - point.y, ahead.x - point.x);
    }
  }
}

app.ticker.add((ticker) => {
  const start = performance.now();
  // The frame after a rebuild or a restore carries its cost as one outlier
  // that would skew the 1% low for the whole window.
  if (skipFrames > 0) skipFrames--;
  else frames.push(ticker.elapsedMS);
  elapsedS += ticker.deltaMS / 1000;

  const far = settings.lod && camera.scale < LOD_SCALE;
  lodLayer.visible = far;
  edgeLayer.visible = !far;
  itemLayer.visible = !far;
  trainLayer.visible = settings.trains > 0;
  if (far) visibleItems = 0;
  else updateItems();
  if (trainLayer.visible) updateTrains();
  updateTimes.push(performance.now() - start);
});

function resetStats() {
  frames.clear();
  updateTimes.clear();
  skipFrames = 2;
}

// Context loss: iOS Safari drops the WebGL context (pixijs#12224). Pixi
// restores its GPU resources on `webglcontextrestored` and re-uploads them on
// the next render; these listeners only time the loss and that first render.
app.canvas.addEventListener("webglcontextlost", () => {
  lostAt = performance.now();
  contextLosses.push({ forced: forcedLoss, lostMs: null, recoveryMs: null });
  forcedLoss = false;
  panel.setStatus("contextLost");
});
app.canvas.addEventListener("webglcontextrestored", () => {
  const restoredAt = performance.now();
  const loss = contextLosses[contextLosses.length - 1];
  loss.lostMs = round(restoredAt - lostAt);
  // UTILITY runs after the render (LOW), so this sees the first frame drawn
  // with the re-created resources.
  app.ticker.addOnce(
    () => {
      loss.recoveryMs = round(performance.now() - restoredAt);
      resetStats();
      panel.setStatus("contextRestored");
    },
    undefined,
    UPDATE_PRIORITY.UTILITY,
  );
});

function forceContextLoss() {
  const gl = renderer.gl;
  const ext = gl.getExtension("WEBGL_lose_context");
  if (!ext || gl.isContextLost()) return;
  forcedLoss = true;
  ext.loseContext();
  setTimeout(() => ext.restoreContext(), CONTEXT_RESTORE_DELAY_MS);
}

// Read once: the GPU does not change, and the results are built 4 times a
// second for the readout.
const gpu = ((): string | null => {
  const gl = renderer.gl;
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  return info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : null;
})();

interface MemoryInfo {
  usedJSHeapSize: number;
}

function heapMb(): number | null {
  const memory = (performance as Performance & { memory?: MemoryInfo }).memory;
  return memory ? round(memory.usedJSHeapSize / 1048576) : null;
}

function results(): StressResults {
  const f = frames.stats();
  const u = updateTimes.stats();
  return {
    ticket: 3,
    date: new Date().toISOString(),
    userAgent: navigator.userAgent,
    devicePixelRatio: window.devicePixelRatio,
    resolution: renderer.resolution,
    screen: { width: app.screen.width, height: app.screen.height },
    renderer: `${renderer.name} ${renderer.context.webGLVersion}`,
    gpu,
    settings: { ...settings, lodActive: !itemLayer.visible },
    zoom: round(camera.scale, 3),
    visibleItems,
    frames: f.frames,
    fps: { avg: round(f.avgFps), low1: round(f.low1Fps) },
    frameMs: {
      avg: round(f.avgMs),
      p99: round(f.p99Ms),
      max: round(f.maxMs),
    },
    updateMs: { avg: round(u.avgMs), p99: round(u.p99Ms) },
    heapMb: heapMb(),
    contextLosses,
  };
}

const panel = createPanel({
  settings,
  onChange(key, value) {
    if (key === "items" && value !== settings.items)
      buildItems(value as number);
    settings[key] = value;
    resetStats();
  },
  onLoseContext: forceContextLoss,
  results,
});

buildItems(settings.items);
setInterval(() => panel.show(results()), 250);
