import { describe, expect, it } from "vitest";
import type { Command } from "../../src/sim/commands/command";
import { CommandQueue } from "../../src/sim/commands/commandQueue";
import { EventQueue } from "../../src/sim/events";
import { nextInt } from "../../src/sim/mapgen/rng";
import { createGameState, type GameState } from "../../src/sim/state/gameState";
import { hashState } from "../../src/sim/state/serialize";
import { tick, type System } from "../../src/sim/tick";
import { AddNode, RemoveNode } from "./support/testCommands";

/** Draws from the state's rng every tick, so the hash covers it. */
const drawSystem: System = (state) => {
  nextInt(state.rng, 0, 100);
};

/** Plays a scripted session: on some ticks the "player" adds, removes or undoes. */
function play(seed: string, ticks: number) {
  const state = createGameState(seed);
  const commands = new CommandQueue();
  const events = new EventQueue();
  for (let t = 0; t < ticks; t++) {
    if (t % 3 === 0) commands.dispatch(state, new AddNode());
    if (t % 7 === 0 && state.nodes.size > 0) {
      const ids = [...state.nodes.keys()];
      commands.dispatch(state, new RemoveNode(ids[t % ids.length]));
    }
    if (t % 11 === 0) commands.undo(state);
    tick(state, commands, events.emit, [drawSystem]);
    events.drain();
  }
  return { state, log: commands.replayLog };
}

function replay(seed: string, ticks: number, log: [number, Command][]) {
  const state = createGameState(seed);
  const commands = new CommandQueue();
  const events = new EventQueue();
  let next = 0;
  while (state.tick < ticks) {
    while (next < log.length && log[next][0] === state.tick) {
      commands.dispatch(state, log[next++][1]);
    }
    tick(state, commands, events.emit, [drawSystem]);
    events.drain();
  }
  return state;
}

describe("tick", () => {
  it("advances the tick counter", () => {
    const state: GameState = createGameState("tick");
    tick(state, new CommandQueue(), () => {});
    expect(state.tick).toBe(1);
  });

  it("gives an identical state hash for the same seed and commands", () => {
    const a = play("determinism", 500);
    const b = play("determinism", 500);
    expect(a.state.tick).toBe(500);
    expect(a.state.nodes.size).toBeGreaterThan(0);
    expect(hashState(a.state)).toBe(hashState(b.state));
  });

  it("gives a different hash for a different seed", () => {
    expect(hashState(play("one", 100).state)).not.toBe(
      hashState(play("two", 100).state),
    );
  });

  it("reproduces the state from the replay log", () => {
    const { state, log } = play("replay", 300);
    expect(hashState(replay("replay", 300, log))).toBe(hashState(state));
  });
});
