import type { StressSettings } from "./panel";

// Frame-time statistics for the stress test: a ring buffer of recent frame
// durations and the summary the designer pastes into the wayfinder ticket.

export interface FrameStats {
  frames: number;
  avgFps: number;
  /** FPS over the slowest 1% of frames. */
  low1Fps: number;
  avgMs: number;
  p99Ms: number;
  maxMs: number;
}

export class FrameWindow {
  private readonly samples: Float64Array;
  private count = 0;
  private next = 0;

  constructor(capacity: number) {
    this.samples = new Float64Array(capacity);
  }

  push(ms: number): void {
    this.samples[this.next] = ms;
    this.next = (this.next + 1) % this.samples.length;
    if (this.count < this.samples.length) this.count++;
  }

  clear(): void {
    this.count = 0;
    this.next = 0;
  }

  stats(): FrameStats {
    const n = this.count;
    if (n === 0) {
      return { frames: 0, avgFps: 0, low1Fps: 0, avgMs: 0, p99Ms: 0, maxMs: 0 };
    }
    // A typed-array sort is numeric without a comparator.
    const sorted = this.samples.slice(0, n).sort();
    let total = 0;
    for (const ms of sorted) total += ms;
    const worstCount = Math.max(1, Math.ceil(n * 0.01));
    let worstTotal = 0;
    for (let i = n - worstCount; i < n; i++) worstTotal += sorted[i];
    const avgMs = total / n;
    return {
      frames: n,
      avgFps: 1000 / avgMs,
      low1Fps: 1000 / (worstTotal / worstCount),
      avgMs,
      p99Ms: sorted[Math.min(n - 1, Math.floor(n * 0.99))],
      maxMs: sorted[n - 1],
    };
  }
}

/** Rounds to `digits` decimal places, for readable JSON. */
export function round(v: number, digits = 1): number {
  const k = 10 ** digits;
  return Math.round(v * k) / k;
}

/** The JSON summary the "copiar resultados" button copies. */
export interface StressResults {
  ticket: number;
  date: string;
  userAgent: string;
  devicePixelRatio: number;
  resolution: number;
  screen: { width: number; height: number };
  renderer: string;
  gpu: string | null;
  settings: StressSettings & { lodActive: boolean };
  zoom: number;
  visibleItems: number;
  frames: number;
  fps: { avg: number; low1: number };
  frameMs: { avg: number; p99: number; max: number };
  updateMs: { avg: number; p99: number };
  heapMb: number | null;
  contextLosses: ContextLoss[];
}

export interface ContextLoss {
  /** Whether the page forced it, as opposed to the browser. */
  forced: boolean;
  /** From `webglcontextlost` to `webglcontextrestored`. */
  lostMs: number | null;
  /** From `webglcontextrestored` to the first frame rendered after it. */
  recoveryMs: number | null;
}
