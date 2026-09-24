import { STAMINA } from "../../data/tap";
import { STAMINA_RECHARGE_TICKS } from "../state/stamina";
import type { System } from "../tick";

/** Gives back 1 point of stamina every 3 s while it is below the maximum (FR75). */
export const stamina: System = (state) => {
  const { stamina } = state;
  if (stamina.points >= STAMINA.max) return;
  if (--stamina.recharge > 0) return;
  stamina.points++;
  stamina.recharge = STAMINA_RECHARGE_TICKS;
};
