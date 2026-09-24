import type { LoopTimings } from "../loop";

/** How often the performance overlay recomputes its averages. */
const WINDOW_MS = 500;

export interface PerfSnapshot {
  fps: number;
  /** Mean duration of one tick over the window, in ms. */
  tickMs: number;
  /** Mean duration of one frame's render over the window, in ms. */
  renderMs: number;
  /** Used JS heap in MB, where the browser exposes `performance.memory`. */
  heapMb: number | null;
}

/**
 * Averages the loop's per-frame timings over half-second windows, so the
 * overlay shows steady numbers instead of every frame's jitter.
 */
export class PerfMonitor {
  private windowStart: number | null = null;
  private frames = 0;
  private ticks = 0;
  private tickTotal = 0;
  private renderTotal = 0;
  snapshot: PerfSnapshot = { fps: 0, tickMs: 0, renderMs: 0, heapMb: null };

  /** Records one frame drawn at `time`. Returns true when the snapshot changed. */
  sample(time: number, timings: Readonly<LoopTimings>): boolean {
    if (this.windowStart === null) {
      this.windowStart = time;
      return false;
    }
    this.frames++;
    this.ticks += timings.ticks;
    this.tickTotal += timings.tickTotalMs;
    this.renderTotal += timings.renderMs;
    const elapsed = time - this.windowStart;
    if (elapsed < WINDOW_MS) return false;
    this.snapshot = {
      fps: (this.frames * 1000) / elapsed,
      tickMs: this.ticks > 0 ? this.tickTotal / this.ticks : 0,
      renderMs: this.renderTotal / this.frames,
      heapMb: heapMb(),
    };
    this.windowStart = time;
    this.frames = this.ticks = this.tickTotal = this.renderTotal = 0;
    return true;
  }
}

/** `performance.memory` is Chromium-only and missing from the DOM types. */
export function heapMb(): number | null {
  const memory = (
    performance as Performance & { memory?: { usedJSHeapSize: number } }
  ).memory;
  return memory ? memory.usedJSHeapSize / 2 ** 20 : null;
}
