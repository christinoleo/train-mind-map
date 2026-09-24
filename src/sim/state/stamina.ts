import { TICK_MS } from "../../config/constants";
import { STAMINA, TAP_YIELD } from "../../data/tap";
import type { GameState } from "./gameState";

/** The pool of manual taps (FR75). */
export interface Stamina {
  points: number;
  /** Ticks until the next point comes back; it runs only below the maximum. */
  recharge: number;
}

/** Ticks per point of stamina recharged. */
export const STAMINA_RECHARGE_TICKS = STAMINA.rechargeMs / TICK_MS;

export function newStamina(): Stamina {
  return { points: STAMINA.max, recharge: STAMINA_RECHARGE_TICKS };
}

/** Items one manual tap yields, raised by the Ferramentas research (FR76). */
export function tapYield(state: Readonly<GameState>): number {
  return TAP_YIELD[state.tapLevel];
}
