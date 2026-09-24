import { Container } from "pixi.js";
import { describe, expect, it } from "vitest";
import { drawCoreRings, OverlayManager } from "../../src/debug/overlays";
import { createGameState, resetGameState } from "../../src/sim/state/gameState";

function setup() {
  const layer = new Container();
  const state = createGameState("overlays");
  const overlays = new OverlayManager(layer, state);
  let draws = 0;
  overlays.register({
    id: "test",
    label: "test",
    draw: () => {
      draws++;
      return new Container({ label: "test" });
    },
  });
  return { layer, state, overlays, draws: () => draws };
}

describe("OverlayManager", () => {
  it("draws an overlay only while it is enabled", () => {
    const { layer, overlays, draws } = setup();
    overlays.refresh();
    expect(draws()).toBe(0);
    overlays.setEnabled("test", true);
    expect(layer.children.map((c) => c.label)).toEqual(["test"]);
    overlays.setEnabled("test", false);
    expect(layer.children).toEqual([]);
    expect(draws()).toBe(1);
  });

  it("redraws enabled overlays when the map changes", () => {
    const { layer, state, overlays, draws } = setup();
    overlays.setEnabled("test", true);
    overlays.refresh();
    const first = draws();
    overlays.refresh();
    expect(draws()).toBe(first);
    state.map.revealedRing = 1;
    overlays.refresh();
    expect(draws()).toBe(first + 1);
    resetGameState(state, "other");
    overlays.refresh();
    expect(draws()).toBe(first + 2);
    expect(layer.children).toHaveLength(1);
  });

  it("redraws enabled overlays after invalidate", () => {
    const { overlays, draws } = setup();
    overlays.setEnabled("test", true);
    overlays.refresh();
    const drawn = draws();
    overlays.invalidate();
    overlays.refresh();
    expect(draws()).toBe(drawn + 1);
  });

  it("rejects a duplicate id", () => {
    const { overlays } = setup();
    expect(() =>
      overlays.register({ id: "test", label: "", draw: () => new Container() }),
    ).toThrow();
  });
});

describe("drawCoreRings", () => {
  it("draws around the Core", () => {
    const g = drawCoreRings(createGameState("rings"));
    expect(g.label).toBe("overlay:core-rings");
    expect(g.getLocalBounds().width).toBeGreaterThan(0);
  });
});
