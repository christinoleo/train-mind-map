import { stepProduction } from "../state/production";
import type { System } from "../tick";

/** Each Extractor makes 1 item of its deposit's resource every 2 s (FR30). */
export const extraction: System = (state, { emit }) => {
  for (const node of state.nodes.values()) {
    if (node.kind === "extractor") stepProduction(node, emit);
  }
};
