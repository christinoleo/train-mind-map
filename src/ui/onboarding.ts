import { NODES } from "../data/nodes";
import { cellCentre, connectorsOf } from "../render/connectors";
import type { Point } from "../sim/geometry/planar";
import { clamp } from "../sim/math";
import { isConnected } from "../sim/state/edges";
import type { FactoryNode, GameState } from "../sim/state/gameState";
import { canAfford, coreNode } from "../sim/state/stock";

/** The onboarding hints, in the order they are shown (FR139). */
const HINTS = ["tap-deposit", "place-extractor", "connect-core"] as const;
export type HintId = (typeof HINTS)[number];

/**
 * What a hint points at: a point of the world, in world units, or the
 * palette's "+" button.
 */
export type HintTarget = { id: HintId } & (
  { at: "world"; point: Point } | { at: "palette" }
);

/**
 * Shows the hints once each and in order (FR139). A hint appears once its
 * moment comes and goes away when the player does what it asks; `seen`,
 * the number of hints done, is what the settings keep.
 */
export class Onboarding {
  /** What the shown hint's action counted when it appeared, or `null` while none is shown. */
  private baseline: number | null = null;
  private taps = 0;

  constructor(
    private seen: number,
    private readonly onSeen: (seen: number) => void,
  ) {}

  /** A manual tap succeeded. */
  tapped() {
    this.taps++;
  }

  /** Shows the hints again from the first ("rever dicas"). */
  reset() {
    this.seen = 0;
    this.baseline = null;
    this.onSeen(0);
  }

  /** The hint to show now, or `null`. Call it every tick. */
  update(state: Readonly<GameState>): HintTarget | null {
    while (this.seen < HINTS.length) {
      const id = HINTS[this.seen];
      if (this.baseline === null) {
        if (!isDue(state, id)) return null;
        this.baseline = this.count(state, id);
      }
      if (this.count(state, id) <= this.baseline) return target(state, id);
      this.seen++;
      this.baseline = null;
      this.onSeen(this.seen);
    }
    return null;
  }

  /** How many times the player did what hint `id` asks, so far. */
  private count(state: Readonly<GameState>, id: HintId): number {
    switch (id) {
      case "tap-deposit":
        return this.taps;
      case "place-extractor":
        return countOf(
          state.nodes.values(),
          (node) => node.kind === "extractor",
        );
      case "connect-core": {
        const core = coreNode(state).id;
        return countOf(state.edges.values(), (edge) => edge.to === core);
      }
    }
  }
}

/** Whether hint `id`'s moment has come, once the hints before it are done. */
function isDue(state: Readonly<GameState>, id: HintId): boolean {
  return id !== "place-extractor" || canAfford(state, NODES.extractor.cost);
}

function target(state: Readonly<GameState>, id: HintId): HintTarget {
  switch (id) {
    case "tap-deposit":
      return { id, at: "world", point: nearestIron(state) };
    case "place-extractor":
      return { id, at: "palette" };
    case "connect-core":
      return { id, at: "world", point: connectFrom(state) };
  }
}

function countOf<T>(items: Iterable<T>, test: (item: T) => boolean): number {
  let n = 0;
  for (const item of items) if (test(item)) n++;
  return n;
}

/** The centre of the iron cell nearest the Core. */
function nearestIron(state: Readonly<GameState>): Point {
  const { core, deposits } = state.map;
  const cx = core.x + core.w / 2;
  const cy = core.y + core.h / 2;
  let best: Point = { x: cx, y: cy };
  let bestDistance = Infinity;
  for (const deposit of deposits) {
    if (deposit.resource !== "iron-ore") continue;
    const cell = {
      x: clamp(Math.floor(cx), deposit.x, deposit.x + deposit.w - 1),
      y: clamp(Math.floor(cy), deposit.y, deposit.y + deposit.h - 1),
    };
    const distance = Math.hypot(cell.x + 0.5 - cx, cell.y + 0.5 - cy);
    if (distance < bestDistance) {
      best = cell;
      bestDistance = distance;
    }
  }
  return cellCentre(best);
}

/**
 * Where to drag an edge to the Core from: the output of the newest Extractor
 * with nothing leaving it, or, with none, the Core's first input.
 */
function connectFrom(state: Readonly<GameState>): Point {
  let newest: FactoryNode | undefined;
  for (const node of state.nodes.values()) {
    const free =
      node.kind === "extractor" &&
      !isConnected(state, "output", { node: node.id, port: 0 });
    if (free) newest = node;
  }
  if (newest) return connectorsOf(newest, "output")[0];
  return connectorsOf(coreNode(state), "input")[0];
}
