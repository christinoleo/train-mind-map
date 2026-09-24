import { describe, expect, it } from "vitest";
import { MAX_TICKS_PER_FRAME, TICK_MS } from "../src/config/constants";
import { createLoop } from "../src/loop";

function harness() {
  let pending: ((time: number) => void) | undefined;
  let ticks = 0;
  const alphas: number[] = [];
  const loop = createLoop({
    step: () => void ticks++,
    frame: (alpha) => void alphas.push(alpha),
    now: () => 0,
    requestFrame: (callback) => {
      pending = callback;
      return 1;
    },
    cancelFrame: () => {
      pending = undefined;
    },
  });
  const frameAt = (time: number) => {
    const callback = pending!;
    pending = undefined;
    callback(time);
  };
  return {
    loop,
    frameAt,
    ticks: () => ticks,
    alphas,
    running: () => pending !== undefined,
  };
}

describe("loop", () => {
  it("runs one tick per TICK_MS and reports the leftover as alpha", () => {
    const h = harness();
    h.loop.start();
    h.frameAt(TICK_MS * 0.5);
    expect(h.ticks()).toBe(0);
    h.frameAt(TICK_MS * 2.25);
    expect(h.ticks()).toBe(2);
    expect(h.alphas).toEqual([0.5, 0.25]);
  });

  it(`runs at most ${MAX_TICKS_PER_FRAME} ticks a frame and catches up later`, () => {
    const h = harness();
    h.loop.start();
    h.frameAt(TICK_MS * 8);
    expect(h.ticks()).toBe(MAX_TICKS_PER_FRAME);
    expect(h.alphas).toEqual([1]);
    h.frameAt(TICK_MS * 8);
    expect(h.ticks()).toBe(8);
  });

  it("stops requesting frames once stopped", () => {
    const h = harness();
    h.loop.start();
    h.loop.stop();
    expect(h.running()).toBe(false);
  });
});
