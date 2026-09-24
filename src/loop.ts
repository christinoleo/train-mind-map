import {
  MAX_BACKLOG_MS,
  MAX_TICKS_PER_FRAME,
  TICK_MS,
} from "./config/constants";

/** How long the last frame spent simulating and drawing, for the debug overlay. */
export interface LoopTimings {
  /** Ticks run in the last frame. */
  ticks: number;
  /** Total duration of those ticks, in ms. */
  tickTotalMs: number;
  /** Duration of the last `frame()` call, in ms. */
  renderMs: number;
}

export interface Loop {
  start(): void;
  stop(): void;
  /**
   * Simulation speed: game time per real time. 0 pauses the simulation while
   * frames keep drawing.
   */
  speed: number;
  readonly timings: Readonly<LoopTimings>;
}

export interface LoopOptions {
  /** Runs one simulation tick. */
  step(): void;
  /** Draws a frame; `alpha` in [0, 1] is how far time has moved past the last tick. */
  frame(alpha: number): void;
  /**
   * Makes up for a gap between frames longer than `MAX_BACKLOG_MS`, such as
   * a backgrounded tab, through the offline path (FR125). Without it the
   * gap is dropped past the backlog.
   */
  catchUp?(ms: number): void;
  now?: () => number;
  requestFrame?: (callback: (time: number) => void) => number;
  cancelFrame?: (handle: number) => void;
}

/**
 * Drives the simulation from `requestAnimationFrame` with a fixed-tick
 * accumulator. At speed 1 a frame runs at most `MAX_TICKS_PER_FRAME` ticks;
 * the rest carries over to later frames, up to `MAX_BACKLOG_MS`. Both limits
 * scale with the speed. A longer gap between frames goes to `catchUp`.
 */
export function createLoop({
  step,
  frame,
  catchUp,
  now = () => performance.now(),
  requestFrame = (callback) => requestAnimationFrame(callback),
  cancelFrame = (handle) => cancelAnimationFrame(handle),
}: LoopOptions): Loop {
  let handle: number | undefined;
  let last = 0;
  let accumulator = 0;
  const timings: LoopTimings = { ticks: 0, tickTotalMs: 0, renderMs: 0 };

  const loop: Loop = {
    speed: 1,
    timings,
    start() {
      if (handle !== undefined) return;
      last = now();
      accumulator = 0;
      handle = requestFrame(onFrame);
    },
    stop() {
      if (handle === undefined) return;
      cancelFrame(handle);
      handle = undefined;
    },
  };

  const onFrame = (time: number) => {
    const { speed } = loop;
    const limitScale = Math.max(speed, 1);
    // rAF's timestamp can predate the `now()` read in start().
    const gap = Math.max(time - last, 0);
    // An absence is real time: the debug speed does not scale it, and a
    // paused game makes up for nothing.
    if (catchUp && speed > 0 && gap > MAX_BACKLOG_MS) catchUp(gap);
    else {
      accumulator = Math.min(
        accumulator + gap * speed,
        MAX_BACKLOG_MS * limitScale,
      );
    }
    last = time;
    const maxTicks = MAX_TICKS_PER_FRAME * limitScale;
    const tickStart = now();
    let ticks = 0;
    for (; ticks < maxTicks && accumulator >= TICK_MS; ticks++) {
      step();
      accumulator -= TICK_MS;
    }
    const renderStart = now();
    frame(Math.min(accumulator / TICK_MS, 1));
    timings.ticks = ticks;
    timings.tickTotalMs = renderStart - tickStart;
    timings.renderMs = now() - renderStart;
    handle = requestFrame(onFrame);
  };

  return loop;
}
