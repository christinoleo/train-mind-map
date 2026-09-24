import { isCrafter, stepProduction } from "../state/production";
import { satisfactionOf } from "../state/power";
import type { System } from "../tick";

/** Furnaces and Assemblers run their recipes (FR31, FR34). */
export const production: System = (state, { emit }) => {
  for (const node of state.nodes.values()) {
    if (isCrafter(node))
      stepProduction(node, satisfactionOf(state, node.id), emit);
  }
};
