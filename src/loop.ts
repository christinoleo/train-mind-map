import {
  MAX_BACKLOG_MS,
  MAX_TICKS_PER_FRAME,
  TICK_MS,
} from "./config/constants";

export interface Loop {
  start(): void;
  stop(): void;
}

export interface LoopOptions {
  /** Runs one simulation tick. */
  step(): void;
  /** Draws a frame; `alpha` in [0, 1] is how far time has moved past the last tick. */
  frame(alpha: number): void;
  now?: () => number;
  requestFrame?: (callback: (time: number) => void) => number;
  cancelFrame?: (handle: number) => void;
}

/**
 * Drives the simulation from `requestAnimationFrame` with a fixed-tick
 * accumulator. A frame runs at most `MAX_TICKS_PER_FRAME` ticks; the rest
 * carries over to later frames, up to `MAX_BACKLOG_MS`.
 */
export function createLoop({
  step,
  frame,
  now = () => performance.now(),
  requestFrame = (callback) => requestAnimationFrame(callback),
  cancelFrame = (handle) => cancelAnimationFrame(handle),
}: LoopOptions): Loop {
  let handle: number | undefined;
  let last = 0;
  let accumulator = 0;

  const onFrame = (time: number) => {
    accumulator = Math.min(accumulator + time - last, MAX_BACKLOG_MS);
    last = time;
    for (let i = 0; i < MAX_TICKS_PER_FRAME && accumulator >= TICK_MS; i++) {
      step();
      accumulator -= TICK_MS;
    }
    frame(Math.min(accumulator / TICK_MS, 1));
    handle = requestFrame(onFrame);
  };

  return {
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
}
