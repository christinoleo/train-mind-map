import { describe, expect, it } from "vitest";
import type { EdgeId } from "../../src/sim/state/ids";
import {
  edgeStatsText,
  formatAmount,
  formatDuration,
  formatGain,
  formatRate,
  slowedEdgeText,
} from "../../src/ui/format";

describe("formatAmount", () => {
  it.each([
    [0, "0"],
    [999, "999"],
    [1000, "1K"],
    [1250, "1,2K"],
    [1999, "1,9K"],
    [9999, "9,9K"],
    [12_345, "12K"],
    [999_999, "999K"],
    [1_000_000, "1M"],
    [3_450_000, "3,4M"],
    [42_000_000, "42M"],
    [999_999_999, "999M"],
    [1e9, "1B"],
    [2.5e12, "2,5T"],
    [999e12, "999T"],
    [1e15, "1aa"],
    [12e15, "12aa"],
    [1e18, "1ab"],
    [Number.MAX_SAFE_INTEGER, "9aa"],
    [1e15 * 1000 ** 26, "1ba"],
  ])("shows %d as %s", (n, text) => {
    expect(formatAmount(n)).toBe(text);
  });

  it("shows the Core's unlimited capacity as ∞", () => {
    expect(formatAmount(Infinity)).toBe("∞");
  });
});

describe("formatRate", () => {
  it.each([
    [0, "0"],
    [0.25, "0,25"],
    [1.5, "1,5"],
    [0.0625, "0,063"],
    [12, "12"],
  ])("shows %d as %s", (n, text) => {
    expect(formatRate(n)).toBe(text);
  });

  it("gives the edge chip its rate", () => {
    expect(edgeStatsText(42, { "iron-ore": 1500 }, 0.25)).toBe(
      "42 células · 1,5K min. ferro · 0,25/s",
    );
  });
});

describe("formatDuration", () => {
  it.each([
    [30_500, "30 s"],
    [45 * 60_000 + 59_000, "45 min"],
    [8 * 3_600_000, "8 h"],
    [2 * 3_600_000 + 15 * 60_000, "2 h 15 min"],
  ])("shows %i ms as %s", (ms, text) => {
    expect(formatDuration(ms)).toBe(text);
  });
});

describe("formatGain", () => {
  it("names the item gained, in pt-BR (FR150)", () => {
    expect(formatGain(1, "stone")).toBe("+1 pedra");
    expect(formatGain(3, "iron-ore")).toBe("+3 minério de ferro");
  });
});

describe("slowedEdgeText", () => {
  it("names the edge and its throughput before and after (FR54)", () => {
    expect(slowedEdgeText({ id: 3 as EdgeId, from: 2, to: 1 })).toBe(
      "aresta 3: 2/s → 1/s",
    );
    expect(slowedEdgeText({ id: 7 as EdgeId, from: 0.5, to: 0.25 })).toBe(
      "aresta 7: 0,5/s → 0,25/s",
    );
  });
});
