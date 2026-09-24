import { describe, expect, it } from "vitest";
import type { ItemCounts } from "../../../src/data/items";
import { MVP_SCENARIO } from "../../../src/data/scenarios/mvp";
import { extrapolate } from "../../../src/sim/offline/extrapolate";
import {
  isSteady,
  meanRates,
  WINDOW_TICKS,
  type Rates,
} from "../../../src/sim/offline/steadyState";
import { createGameState } from "../../../src/sim/state/gameState";
import type { NodeId } from "../../../src/sim/state/ids";
import { createNode } from "../../../src/sim/state/nodes";
import {
  coreNode,
  storageCapacity,
  store,
  storedItems,
} from "../../../src/sim/state/stock";

const CORE = 1 as NodeId;

/** Rates of the Core alone, from counts per window. */
function perWindow(counts: ItemCounts): Rates {
  const rate: ItemCounts = {};
  for (const [item, n] of Object.entries(counts)) {
    rate[item as keyof ItemCounts] = n / WINDOW_TICKS;
  }
  return new Map([[CORE, rate]]);
}

describe("isSteady", () => {
  const state = createGameState(MVP_SCENARIO);

  it("accepts rates within 2%", () => {
    expect(
      isSteady(state, perWindow({ gear: 1000 }), perWindow({ gear: 985 })),
    ).toBe(true);
    expect(
      isSteady(state, perWindow({ gear: 1000 }), perWindow({ gear: 970 })),
    ).toBe(false);
  });

  it("forgives one item from where the batches fell", () => {
    expect(
      isSteady(state, perWindow({ gear: 18 }), perWindow({ gear: 19 })),
    ).toBe(true);
    expect(
      isSteady(state, perWindow({ gear: 18 }), perWindow({ gear: 20 })),
    ).toBe(false);
  });

  it("wants every item steady", () => {
    expect(
      isSteady(
        state,
        perWindow({ gear: 60, brick: 30 }),
        perWindow({ gear: 60 }),
      ),
    ).toBe(false);
  });

  it("takes still windows for a slow start while a node works", () => {
    const still = perWindow({});
    expect(isSteady(state, still, still)).toBe(true);
    const extractor = createNode(2 as NodeId, "extractor", 0, 0, {
      resource: "coal",
    });
    if (extractor.kind === "extractor") extractor.production.status = "working";
    state.nodes.set(extractor.id, extractor);
    expect(isSteady(state, still, still)).toBe(false);
  });
});

describe("meanRates", () => {
  it("averages the two windows", () => {
    const mean = meanRates(perWindow({ gear: 18 }), perWindow({ gear: 20 }));
    expect((mean.get(CORE)?.gear ?? 0) * WINDOW_TICKS).toBeCloseTo(19);
  });
});

describe("extrapolate", () => {
  it("shares the room left among the items gained", () => {
    const state = createGameState(MVP_SCENARIO);
    const core = coreNode(state);
    store(core, "stone", storageCapacity(state, core) - 90);
    extrapolate(state, perWindow({ gear: 200, brick: 100 }), WINDOW_TICKS);
    expect(storedItems(core)).toMatchObject({ gear: 60, brick: 30 });
  });

  it("takes what was lost, down to empty", () => {
    const state = createGameState(MVP_SCENARIO);
    const core = coreNode(state);
    store(core, "coal", 50);
    extrapolate(state, perWindow({ coal: -30 }), 3 * WINDOW_TICKS);
    expect(storedItems(core).coal).toBeUndefined();
  });
});
