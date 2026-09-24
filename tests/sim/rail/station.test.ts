import { describe, expect, it } from "vitest";
import { NODES } from "../../../src/data/nodes";
import { STATION } from "../../../src/data/rail";
import { railPorts, trainCapacity } from "../../../src/sim/rail/station";

describe("a Station's rail ports (FR41)", () => {
  it("has one on the left and one on the right in the MVP", () => {
    const ports = railPorts({ kind: "station", x: 10, y: 20 });
    expect(ports.map(({ side, index }) => [side, index])).toEqual([
      ["left", 0],
      ["right", 0],
    ]);
  });

  it("sits in the cell just outside each side, on the same row", () => {
    const [left, right] = railPorts({ kind: "station", x: 10, y: 20 });
    expect(left.cell).toEqual({ x: 9, y: 21 });
    expect(right.cell).toEqual({ x: 12, y: 21 });
  });

  it("follows the Station when it moves", () => {
    const [left] = railPorts({ kind: "station", x: 3, y: 4 });
    expect(left.cell).toEqual({ x: 2, y: 5 });
  });

  it("gives each port on a side its own cell, beside the card", () => {
    const { size } = NODES.station;
    for (const side of ["left", "right"] as const) {
      const cells = railPorts({ kind: "station", x: 0, y: 0 })
        .filter((port) => port.side === side)
        .map((port) => port.cell);
      expect(cells).toHaveLength(STATION.railPorts[side]);
      expect(new Set(cells.map((c) => c.y)).size).toBe(cells.length);
      for (const c of cells) {
        expect(c.x).toBe(side === "left" ? -1 : size);
        expect(c.y).toBeGreaterThanOrEqual(0);
        expect(c.y).toBeLessThan(size);
      }
    }
  });
});

describe("a Station", () => {
  it("is a 2×2 card with 3 inputs and 3 outputs, unlocked by research", () => {
    expect(NODES.station).toMatchObject({
      size: 2,
      inputs: 3,
      outputs: 3,
      category: "rail",
      cost: { "iron-plate": 20, brick: 10 },
      unlock: "research",
    });
  });

  it("buffers twice the load of a 2-wagon train", () => {
    expect(STATION.bufferTrains * trainCapacity(2)).toBe(200);
  });
});
