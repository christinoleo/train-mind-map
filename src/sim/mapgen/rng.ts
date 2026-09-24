/**
 * The sfc32 generator state: four unsigned 32-bit words. It is a plain array
 * so it lives in GameState and saves as-is.
 */
export type RngState = [number, number, number, number];

/** Derives a 128-bit seed from a seed string (cyrb128). */
function cyrb128(text: string): RngState {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < text.length; i++) {
    const k = text.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

export function seedRng(seed: string): RngState {
  const rng = cyrb128(seed);
  // Discard the first outputs, which still correlate with the seed.
  for (let i = 0; i < 15; i++) nextUint32(rng);
  return rng;
}

/** Advances the generator in place and returns an unsigned 32-bit integer. */
export function nextUint32(rng: RngState): number {
  let [a, b, c, d] = rng;
  const t = (((a + b) | 0) + d) | 0;
  d = (d + 1) | 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) | 0;
  c = (c << 21) | (c >>> 11);
  c = (c + t) | 0;
  rng[0] = a >>> 0;
  rng[1] = b >>> 0;
  rng[2] = c >>> 0;
  rng[3] = d >>> 0;
  return t >>> 0;
}

/** A float in [0, 1). */
export function nextFloat(rng: RngState): number {
  return nextUint32(rng) / 4294967296;
}

/** An integer in [min, max). */
export function nextInt(rng: RngState, min: number, max: number): number {
  return min + Math.floor(nextFloat(rng) * (max - min));
}
