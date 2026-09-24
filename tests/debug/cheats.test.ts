import { describe, expect, it } from "vitest";
import { MAP_SIZE } from "../../src/config/constants";
import { GiveItems, MAX_RING, SetRevealedRing } from "../../src/debug/cheats";
import { CommandQueue } from "../../src/sim/commands/commandQueue";
import { EventQueue } from "../../src/sim/events";
import { createGameState } from "../../src/sim/state/gameState";
import { revealedSize } from "../../src/sim/state/map";
import { tick } from "../../src/sim/tick";

describe("SetRevealedRing", () => {
  it("reveals up to the ring that covers the whole map", () => {
    expect(revealedSize(MAX_RING)).toBeGreaterThanOrEqual(MAP_SIZE);
    expect(revealedSize(MAX_RING - 1)).toBeLessThan(MAP_SIZE);
  });

  it("rejects rings outside the map", () => {
    for (const ring of [-1, MAX_RING + 1, 1.5]) {
      expect(new SetRevealedRing(ring).validate()).toEqual({
        ok: false,
        reason: "out_of_range",
      });
    }
  });

  it("applies through the queue and undoes to the previous ring", () => {
    const state = createGameState("cheats");
    const commands = new CommandQueue();
    const events = new EventQueue();
    expect(commands.dispatch(state, new SetRevealedRing(2)).ok).toBe(true);
    tick(state, commands, events.emit);
    expect(state.map.revealedRing).toBe(2);
    commands.undo(state);
    tick(state, commands, events.emit);
    expect(state.map.revealedRing).toBe(0);
  });
});

describe("GiveItems", () => {
  it("fills storage with every item, and undoes to the old contents", () => {
    const state = createGameState("cheats");
    const commands = new CommandQueue();
    const events = new EventQueue();
    commands.dispatch(state, new GiveItems(5));
    tick(state, commands, events.emit);
    expect(state.stock.gear).toBe(5);
    expect(state.stock["iron-ore"]).toBe(5);
    commands.undo(state);
    tick(state, commands, events.emit);
    expect(state.stock).toEqual({});
  });
});
