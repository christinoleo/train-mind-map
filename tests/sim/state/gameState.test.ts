import { describe, expect, it } from "vitest";
import {
  createGameState,
  resetGameState,
} from "../../../src/sim/state/gameState";

describe("resetGameState", () => {
  it("replaces the state in place with the game a fresh seed gives", () => {
    const state = createGameState("first");
    state.tick = 42;
    state.map.revealedRing = 2;
    const oldMap = state.map;
    resetGameState(state, "abc");
    expect(state.map).not.toBe(oldMap);
    expect(state).toEqual(createGameState("abc"));
  });
});
