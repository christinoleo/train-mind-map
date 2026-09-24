import { describe, expect, it } from "vitest";
import { CELL_PX } from "../../src/config/constants";
import { MVP_SCENARIO } from "../../src/data/scenarios/mvp";
import { CommandQueue } from "../../src/sim/commands/commandQueue";
import { ConnectEdge } from "../../src/sim/commands/connectEdge";
import { PlaceNode } from "../../src/sim/commands/placeNode";
import { EventQueue } from "../../src/sim/events";
import { createGameState, type GameState } from "../../src/sim/state/gameState";
import { coreNode } from "../../src/sim/state/stock";
import { tick } from "../../src/sim/tick";
import { Onboarding } from "../../src/ui/onboarding";
import { fillCore } from "../sim/support/stock";

function run(
  state: GameState,
  command: Parameters<CommandQueue["dispatch"]>[1],
) {
  const commands = new CommandQueue();
  expect(commands.dispatch(state, command).ok).toBe(true);
  tick(state, commands, new EventQueue().emit);
}

function setup(seen = 0) {
  const state = createGameState(MVP_SCENARIO);
  const saved: number[] = [];
  const onboarding = new Onboarding(seen, (n) => saved.push(n));
  return { state, saved, onboarding };
}

describe("Onboarding", () => {
  it("points at the iron nearest the Core first", () => {
    const { state, onboarding } = setup();
    const hint = onboarding.update(state);
    expect(hint?.id).toBe("tap-deposit");
    if (hint?.at !== "world") throw new Error("expected a world hint");
    const cell = {
      x: Math.floor(hint.point.x / CELL_PX),
      y: Math.floor(hint.point.y / CELL_PX),
    };
    const deposit = state.map.deposits.find(
      (d) =>
        cell.x >= d.x &&
        cell.x < d.x + d.w &&
        cell.y >= d.y &&
        cell.y < d.y + d.h,
    );
    expect(deposit?.resource).toBe("iron-ore");
  });

  it("shows each hint once, in order, and dismisses it on its action", () => {
    const { state, saved, onboarding } = setup();
    expect(onboarding.update(state)?.id).toBe("tap-deposit");

    onboarding.tapped();
    // The stock cannot pay for an Extractor yet.
    expect(onboarding.update(state)).toBeNull();
    expect(saved).toEqual([1]);

    fillCore(state);
    expect(onboarding.update(state)).toEqual({
      id: "place-extractor",
      at: "palette",
    });

    // On the stone, west of the Core, facing its inputs.
    run(state, new PlaceNode("extractor", 51, 59));
    const connect = onboarding.update(state);
    expect(connect?.id).toBe("connect-core");
    expect(saved).toEqual([1, 2]);

    const extractor = [...state.nodes.values()].find(
      (n) => n.kind === "extractor",
    )!;
    run(
      state,
      new ConnectEdge(
        { node: extractor.id, port: 0 },
        { node: coreNode(state).id, port: 0 },
      ),
    );
    expect(state.edges.size).toBe(1);
    expect(onboarding.update(state)).toBeNull();
    expect(saved).toEqual([1, 2, 3]);
  });

  it("waits for a new action, not one done before the hint showed", () => {
    const { state, onboarding } = setup(1);
    fillCore(state);
    run(state, new PlaceNode("extractor", 65, 58));
    expect(onboarding.update(state)?.id).toBe("place-extractor");
  });

  it("shows nothing once every hint was seen, until reset", () => {
    const { state, saved, onboarding } = setup(3);
    expect(onboarding.update(state)).toBeNull();
    onboarding.reset();
    expect(saved).toEqual([0]);
    expect(onboarding.update(state)?.id).toBe("tap-deposit");
  });
});
