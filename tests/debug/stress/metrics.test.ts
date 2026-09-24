import { describe, expect, it } from "vitest";
import { FrameWindow } from "../../../src/debug/stress/metrics";

describe("FrameWindow", () => {
  it("reports zeros when empty", () => {
    expect(new FrameWindow(10).stats().avgFps).toBe(0);
  });

  it("computes average FPS and the 1% low", () => {
    const w = new FrameWindow(200);
    for (let i = 0; i < 198; i++) w.push(10);
    w.push(50);
    w.push(30);
    const s = w.stats();
    expect(s.frames).toBe(200);
    expect(s.avgMs).toBeCloseTo((198 * 10 + 80) / 200);
    // The slowest 1% of 200 frames is 2 frames: 50 and 30 ms.
    expect(s.low1Fps).toBeCloseTo(25);
    expect(s.maxMs).toBe(50);
  });

  it("keeps only the latest samples", () => {
    const w = new FrameWindow(3);
    w.push(100);
    for (let i = 0; i < 3; i++) w.push(20);
    expect(w.stats()).toMatchObject({ frames: 3, avgFps: 50, maxMs: 20 });
  });
});
