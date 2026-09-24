import type { RawResource } from "./items";

/** The raw resources a manual tap draws from: all but crude oil (FR74). */
export const TAPPABLE: readonly RawResource[] = [
  "iron-ore",
  "copper-ore",
  "coal",
  "stone",
];

/** Stamina: each tap spends 1 point of 20, and 1 comes back every 3 s (FR75). */
export const STAMINA = { max: 20, rechargeMs: 3000 } as const;

/**
 * Items per tap by Ferramentas research level: 1 before it, then 2 and 4
 * (FR76, Epic 4).
 */
export const TAP_YIELD = [1, 2, 4] as const;
