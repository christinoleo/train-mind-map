import { describe, expect, it } from "vitest";
import {
  nextFloat,
  nextInt,
  nextUint32,
  seedRng,
} from "../../../src/sim/mapgen/rng";

describe("rng", () => {
  it("gives the same sequence for the same seed", () => {
    const a = seedRng("alpha");
    const b = seedRng("alpha");
    const seqA = Array.from({ length: 100 }, () => nextUint32(a));
    const seqB = Array.from({ length: 100 }, () => nextUint32(b));
    expect(seqA).toEqual(seqB);
  });

  it("gives different sequences for different seeds", () => {
    const a = seedRng("alpha");
    const b = seedRng("alphb");
    expect(nextUint32(a)).not.toBe(nextUint32(b));
  });

  it("keeps its state as four unsigned 32-bit words", () => {
    const rng = seedRng("alpha");
    for (let i = 0; i < 1000; i++) nextUint32(rng);
    expect(rng).toHaveLength(4);
    for (const word of rng) {
      expect(Number.isInteger(word)).toBe(true);
      expect(word).toBeGreaterThanOrEqual(0);
      expect(word).toBeLessThan(2 ** 32);
    }
  });

  it("resumes from a copied state", () => {
    const rng = seedRng("alpha");
    nextUint32(rng);
    const copy = JSON.parse(JSON.stringify(rng));
    expect(nextUint32(copy)).toBe(nextUint32(rng));
  });

  it("keeps floats in [0, 1) and ints in [min, max)", () => {
    const rng = seedRng("range");
    for (let i = 0; i < 1000; i++) {
      const f = nextFloat(rng);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const n = nextInt(rng, -3, 4);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(-3);
      expect(n).toBeLessThan(4);
    }
  });
});
