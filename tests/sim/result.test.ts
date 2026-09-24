import { describe, expect, it } from "vitest";
import { assert } from "../../src/sim/assert";
import { fail, ok, type Result } from "../../src/sim/result";

describe("Result helpers", () => {
  it("ok wraps a value", () => {
    expect(ok(3)).toEqual({ ok: true, value: 3 });
  });

  it("ok without a value is a void success", () => {
    const r: Result = ok();
    expect(r).toEqual({ ok: true, value: undefined });
  });

  it("fail carries the reason", () => {
    const r: Result<number> = fail("crosses_edge");
    expect(r).toEqual({ ok: false, reason: "crosses_edge" });
  });

  it("narrows on ok", () => {
    const r: Result<number> = Math.max(1, 2) > 1 ? ok(2) : fail("no_stock");
    if (!r.ok) throw new Error("expected ok");
    expect(r.value + 1).toBe(3);
  });
});

describe("assert", () => {
  it("passes on a truthy condition", () => {
    expect(() => assert(1, "never")).not.toThrow();
  });

  it("throws with the message on a falsy condition", () => {
    expect(() => assert(false, "node has no cell")).toThrow(
      "Assertion failed: node has no cell",
    );
  });
});
