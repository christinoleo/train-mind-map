import { describe, expect, it } from "vitest";
import { PerfMonitor } from "../../src/debug/perf";

describe("PerfMonitor", () => {
  it("averages frames, ticks and renders over a half-second window", () => {
    const monitor = new PerfMonitor();
    expect(monitor.sample(0, { ticks: 0, tickTotalMs: 0, renderMs: 0 })).toBe(
      false,
    );
    let changed = false;
    // 30 frames 1000/60 ms apart: two ticks of 1 ms each and a 4 ms render.
    for (let i = 1; i <= 30; i++) {
      changed = monitor.sample((i * 1000) / 60, {
        ticks: 2,
        tickTotalMs: 2,
        renderMs: 4,
      });
    }
    expect(changed).toBe(true);
    expect(monitor.snapshot.fps).toBeCloseTo(60);
    expect(monitor.snapshot.tickMs).toBeCloseTo(1);
    expect(monitor.snapshot.renderMs).toBeCloseTo(4);
  });

  it("reports zero tick time when no tick ran", () => {
    const monitor = new PerfMonitor();
    monitor.sample(0, { ticks: 0, tickTotalMs: 0, renderMs: 0 });
    monitor.sample(600, { ticks: 0, tickTotalMs: 0, renderMs: 2 });
    expect(monitor.snapshot.tickMs).toBe(0);
    expect(monitor.snapshot.renderMs).toBe(2);
  });
});
