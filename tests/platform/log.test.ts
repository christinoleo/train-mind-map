import { afterEach, describe, expect, it, vi } from "vitest";
import { createLogger, LOG_BUFFER_SIZE } from "../../src/platform/log";

afterEach(() => vi.restoreAllMocks());

describe("logger ring buffer", () => {
  it("keeps only warn and error entries", () => {
    const log = createLogger({ console: false, now: () => 7 });
    log.debug("sim", "d");
    log.info("sim", "i");
    log.warn("rail", "deadlock", { trains: [12, 15] });
    log.error("save", "e");
    expect(log.entries()).toEqual([
      {
        time: 7,
        level: "warn",
        module: "rail",
        msg: "deadlock",
        data: { trains: [12, 15] },
      },
      { time: 7, level: "error", module: "save", msg: "e" },
    ]);
  });

  it("caps at 200 entries, dropping the oldest first", () => {
    const log = createLogger({ console: false });
    for (let i = 0; i < LOG_BUFFER_SIZE + 50; i++) log.warn("sim", `m${i}`);
    const entries = log.entries();
    expect(LOG_BUFFER_SIZE).toBe(200);
    expect(entries).toHaveLength(200);
    expect(entries[0].msg).toBe("m50");
    expect(entries[199].msg).toBe("m249");
  });

  it("returns entries in order before and exactly at capacity", () => {
    const log = createLogger({ console: false, capacity: 3 });
    log.warn("ui", "a");
    log.warn("ui", "b");
    expect(log.entries().map((e) => e.msg)).toEqual(["a", "b"]);
    log.warn("ui", "c");
    expect(log.entries().map((e) => e.msg)).toEqual(["a", "b", "c"]);
    log.warn("ui", "d");
    expect(log.entries().map((e) => e.msg)).toEqual(["b", "c", "d"]);
  });

  it("returns a copy, not the live buffer", () => {
    const log = createLogger({ console: false });
    log.warn("ui", "a");
    log.entries().pop();
    expect(log.entries()).toHaveLength(1);
  });

  it("echoes every level to the console when enabled", () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = createLogger({ console: true });
    log.debug("audio", "tick");
    log.warn("power", "low", 3);
    expect(debug).toHaveBeenCalledWith("[audio] tick");
    expect(warn).toHaveBeenCalledWith("[power] low", 3);
  });

  it("stays silent on the console when disabled", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    createLogger({ console: false }).warn("ui", "x");
    expect(warn).not.toHaveBeenCalled();
  });
});
