import { stepTrain } from "../rail/trains";
import type { System } from "../tick";

/** Moves every train by one tick, in the order they were built. */
export const trains: System = (state, { emit }) => {
  for (const train of state.trains.values()) stepTrain(state, train, emit);
};
