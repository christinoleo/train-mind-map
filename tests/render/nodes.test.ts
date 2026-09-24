import { assert, describe, expect, it } from "vitest";
import { NODE_KINDS, NODES } from "../../src/data/nodes";
import { connectorPoints } from "../../src/render/connectors";
import { flaggedStatus } from "../../src/render/nodes";
import type { NodeId } from "../../src/sim/state/ids";
import { createNode } from "../../src/sim/state/nodes";
import { CELL_PX } from "../../src/render/theme";
import { connectorRows } from "../../src/sim/state/edges";

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

describe("connector rows", () => {
  it.each(NODE_KINDS)("centres %s's connectors on their edge rows", (kind) => {
    const { size, inputs } = NODES[kind];
    const rows = connectorRows(inputs, size);
    connectorPoints(kind).inputs.forEach((p, i) => {
      expect(Math.floor(p.y / CELL_PX)).toBe(rows[i]);
    });
  });
});

describe("flaggedStatus", () => {
  it("flags every status of a producer but working (FR149)", () => {
    const node = createNode(1 as NodeId, "furnace", 0, 0);
    assert("production" in node);
    for (const status of ["blocked", "starved", "no_power"] as const) {
      node.production.status = status;
      expect(flaggedStatus(node)).toBe(status);
    }
    node.production.status = "working";
    expect(flaggedStatus(node)).toBeNull();
  });

  it("flags nothing on a node that makes no items", () => {
    expect(flaggedStatus(createNode(1 as NodeId, "box", 0, 0))).toBeNull();
  });
});
