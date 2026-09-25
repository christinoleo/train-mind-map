import { breakDeadlocks } from "../rail/deadlock";
import { stepTrain } from "../rail/trains";
import type { System } from "../tick";

/**
 * Moves every train by one tick, in the order they were built, then breaks
 * any cycle of trains waiting on each other for good.
 */
export const trains: System = (state, { emit }) => {
  for (const train of state.trains.values()) stepTrain(state, train, emit);
  breakDeadlocks(state, emit);
};
