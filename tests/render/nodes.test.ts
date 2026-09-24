import { describe, expect, it } from "vitest";
import { NODE_KINDS, NODES } from "../../src/data/nodes";
import { connectorPoints } from "../../src/render/nodes";
import { CELL_PX } from "../../src/render/theme";

describe("connectorPoints", () => {
  it.each(NODE_KINDS)(
    "puts %s's inputs on the left edge and outputs on the right",
    (kind) => {
      const { size, inputs, outputs } = NODES[kind];
      const side = size * CELL_PX;
      const points = connectorPoints(kind);
      expect(points.inputs).toHaveLength(inputs);
      expect(points.outputs).toHaveLength(outputs);
      expect(points.inputs.every((p) => p.x === 0)).toBe(true);
      expect(points.outputs.every((p) => p.x === side)).toBe(true);
      for (const p of [...points.inputs, ...points.outputs]) {
        expect(p.y).toBeGreaterThan(0);
        expect(p.y).toBeLessThan(side);
      }
    },
  );
});
