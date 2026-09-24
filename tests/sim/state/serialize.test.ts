import { describe, expect, it } from "vitest";
import { createGameState } from "../../../src/sim/state/gameState";
import { allocateId } from "../../../src/sim/state/ids";
import {
  deserializeState,
  hashState,
  serializeState,
} from "../../../src/sim/state/serialize";

describe("state serialization", () => {
  it("allocates incremental ids per kind", () => {
    const state = createGameState("ids");
    expect(allocateId(state.nextIds, "node")).toBe(1);
    expect(allocateId(state.nextIds, "node")).toBe(2);
    expect(allocateId(state.nextIds, "edge")).toBe(1);
  });

  it("round-trips through JSON", () => {
    const state = createGameState("save");
    const id = allocateId(state.nextIds, "node");
    state.nodes.set(id, { id });
    state.tick = 42;

    const json = JSON.stringify(serializeState(state));
    const restored = deserializeState(JSON.parse(json));

    expect(restored).toEqual(state);
    expect(restored.nodes).toBeInstanceOf(Map);
    expect(hashState(restored)).toBe(hashState(state));
  });

  it("does not share data with the live state", () => {
    const state = createGameState("copy");
    const saved = serializeState(state);
    state.rng[0] = 0;
    expect(saved.rng[0]).not.toBe(0);
  });

  it("hashes different states differently", () => {
    const a = createGameState("hash");
    const b = createGameState("hash");
    b.tick = 1;
    expect(hashState(a)).not.toBe(hashState(b));
  });
});
