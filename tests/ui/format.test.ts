import { describe, expect, it } from "vitest";
import { formatCount, formatDuration } from "../../src/ui/format";

describe("formatCount", () => {
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
  ])("shows %i as %s", (n, text) => {
    expect(formatCount(n)).toBe(text);
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
