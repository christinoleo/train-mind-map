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
  type StorageNode,
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

  it("gives no slack to an item that only starts arriving", () => {
    expect(isSteady(state, perWindow({}), perWindow({ gear: 1 }))).toBe(false);
    expect(
      isSteady(state, perWindow({ gear: 1 }), perWindow({ gear: 1 })),
    ).toBe(true);
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

  it("stops once an item storage loses runs out", () => {
    const state = createGameState(MVP_SCENARIO);
    const core = coreNode(state);
    store(core, "iron-ore", 50);
    // A Box's ore becomes the Core's plates, as a Furnace between them would.
    const box = createNode(2 as NodeId, "box", 0, 0);
    state.nodes.set(box.id, box);
    const rates: Rates = new Map([
      [
        CORE,
        { "iron-ore": -30 / WINDOW_TICKS, "iron-plate": 30 / WINDOW_TICKS },
      ],
      [box.id, { brick: 10 / WINDOW_TICKS }],
    ]);
    extrapolate(state, rates, 10 * WINDOW_TICKS);
    expect(storedItems(core)).toEqual({ "iron-plate": 50 });
    expect(storedItems(box as StorageNode)).toEqual({ brick: 16 });
  });
});
