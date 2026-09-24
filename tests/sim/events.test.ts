import { describe, expect, it } from "vitest";
import { EventQueue, type SimEvent } from "../../src/sim/events";

const rejected = (command: string): SimEvent => ({
  type: "CommandRejected",
  command,
  reason: "not_found",
});

describe("event queue", () => {
  it("delivers events only when drained, in emission order", () => {
    const events = new EventQueue();
    const seen: string[] = [];
    events.on("CommandRejected", (e) => seen.push(e.command));
    events.emit(rejected("a"));
    events.emit(rejected("b"));
    expect(seen).toEqual([]);
    events.drain();
    expect(seen).toEqual(["a", "b"]);
    events.drain();
    expect(seen).toEqual(["a", "b"]);
  });

  it("stops delivering after unsubscribing", () => {
    const events = new EventQueue();
    const seen: string[] = [];
    const off = events.on("CommandRejected", (e) => seen.push(e.command));
    off();
    events.emit(rejected("a"));
    events.drain();
    expect(seen).toEqual([]);
  });
});
