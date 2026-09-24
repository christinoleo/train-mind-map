const STEPS = [
  { size: 1_000_000, suffix: "M" },
  { size: 1_000, suffix: "K" },
] as const;

/**
 * A count in K/M notation for the HUD, in pt-BR: 950, 1,2K, 12K, 3,4M. It
 * rounds down, so the HUD never shows more than there is.
 */
export function formatCount(n: number): string {
  for (const { size, suffix } of STEPS) {
    if (n < size) continue;
    const scaled = n / size;
    // One decimal below 10 (1,2K), none from there on (12K).
    const shown =
      scaled < 10 ? Math.floor(scaled * 10) / 10 : Math.floor(scaled);
    return `${String(shown).replace(".", ",")}${suffix}`;
  }
  return String(n);
}
