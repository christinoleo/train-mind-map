import { describe, expect, it } from "vitest";
import { formatCount } from "../../src/ui/format";

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
