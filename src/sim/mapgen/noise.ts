import { nextFloat, nextInt, type RngState } from "./rng";

/** Noise sampled at any point, returning a value in [0, 1). */
export type Noise2D = (x: number, y: number) => number;

const TABLE_SIZE = 256;
const MASK = TABLE_SIZE - 1;

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Seeded 2D value noise: random values on the integer lattice, blended with
 * smoothstep. It draws its tables from `rng`, so the same rng state gives the
 * same noise.
 */
export function createValueNoise(rng: RngState): Noise2D {
  const values = Array.from({ length: TABLE_SIZE }, () => nextFloat(rng));
  const perm = Array.from({ length: TABLE_SIZE }, (_, i) => i);
  for (let i = TABLE_SIZE - 1; i > 0; i--) {
    const j = nextInt(rng, 0, i + 1);
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  const lattice = (ix: number, iy: number) =>
    values[perm[(perm[ix & MASK] + iy) & MASK]];

  return (x, y) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const tx = smoothstep(x - x0);
    const ty = smoothstep(y - y0);
    const top = lerp(lattice(x0, y0), lattice(x0 + 1, y0), tx);
    const bottom = lerp(lattice(x0, y0 + 1), lattice(x0 + 1, y0 + 1), tx);
    return lerp(top, bottom, ty);
  };
}

/**
 * Fractal noise: `octaves` layers of `noise`, each at twice the frequency and
 * half the weight of the last, normalised back to [0, 1).
 */
export function fractalNoise(noise: Noise2D, octaves: number): Noise2D {
  return (x, y) => {
    let sum = 0;
    let weight = 1;
    let total = 0;
    let scale = 1;
    for (let i = 0; i < octaves; i++) {
      // Offset each octave so lattice points do not line up across octaves.
      sum += noise(x * scale + i * 17.3, y * scale + i * 31.7) * weight;
      total += weight;
      weight /= 2;
      scale *= 2;
    }
    return sum / total;
  };
}
