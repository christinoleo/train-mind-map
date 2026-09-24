import { describe, expect, it } from "vitest";
import { createValueNoise, fractalNoise } from "../../../src/sim/mapgen/noise";
import { seedRng } from "../../../src/sim/mapgen/rng";

describe("noise", () => {
  it("gives the same values for the same seed", () => {
    const a = createValueNoise(seedRng("lakes"));
    const b = createValueNoise(seedRng("lakes"));
    for (let i = 0; i < 50; i++)
      expect(a(i * 0.37, i * 1.13)).toBe(b(i * 0.37, i * 1.13));
  });

  it("stays in [0, 1) and varies smoothly", () => {
    const noise = fractalNoise(createValueNoise(seedRng("range")), 3);
    let previous = noise(0, 3.5);
    for (let i = 1; i < 2000; i++) {
      const value = noise(i * 0.01, 3.5);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      expect(Math.abs(value - previous)).toBeLessThan(0.1);
      previous = value;
    }
  });

  it("matches the lattice value at integer points", () => {
    const noise = createValueNoise(seedRng("lattice"));
    expect(noise(3, 4)).toBe(noise(3 + 1e-12, 4));
  });
});
