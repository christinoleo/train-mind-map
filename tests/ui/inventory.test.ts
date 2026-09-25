import { describe, expect, it } from "vitest";
import { ITEM_CATEGORIES, ITEM_CATEGORY } from "../../src/data/items";
import { MVP_SCENARIO } from "../../src/data/scenarios/mvp";
import { SetBoxConstruction } from "../../src/sim/commands/setBoxConstruction";
import { createGameState } from "../../src/sim/state/gameState";
import { allocateId } from "../../src/sim/state/ids";
import { createNode } from "../../src/sim/state/nodes";
import { coreNode, isStorage, store } from "../../src/sim/state/stock";
import { inventoryInfo } from "../../src/ui/InventoryPanel";
import { fillCore } from "../sim/support/stock";

function setup() {
  const state = createGameState(MVP_SCENARIO);
  const putBox = () => {
    const id = allocateId(state.nextIds, "node");
    const box = createNode(id, "box", 45, 45);
    if (!isStorage(box)) throw new Error("a Box is storage");
    state.nodes.set(id, box);
    return box;
  };
  return { state, core: coreNode(state), putBox };
}

describe("inventoryInfo", () => {
  it("shows an empty stock", () => {
    const { state } = setup();
    expect(inventoryInfo(state)).toEqual({ used: 0, slots: [] });
  });

  it("orders the slots raw, smelted, intermediate, then science", () => {
    const { state } = setup();
    fillCore(state, 1);
    const ranks = inventoryInfo(state).slots.map(({ item }) =>
      ITEM_CATEGORIES.indexOf(ITEM_CATEGORY[item]),
    );
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(ranks.at(0)).toBe(0);
    expect(ranks.at(-1)).toBe(ITEM_CATEGORIES.length - 1);
  });

  it("sums each item over every storage and lists where it is", () => {
    const { state, core, putBox } = setup();
    const first = putBox();
    const second = putBox();
    store(core, "gear", 3);
    store(second, "gear", 1200);
    store(first, "iron-ore", 5);
    const { slots } = inventoryInfo(state);
    expect(slots.map(({ item, count }) => [item, count])).toEqual([
      ["iron-ore", 5],
      ["gear", 1203],
    ]);
    expect(slots[1].storages).toEqual([
      { id: core.id, kind: "core", number: 0, count: 3, kept: false },
      { id: second.id, kind: "box", number: 2, count: 1200, kept: false },
    ]);
  });

  it("leaves the Boxes kept out of construction out of the count", () => {
    const { state, putBox } = setup();
    const box = putBox();
    store(box, "coal", 7);
    expect(inventoryInfo(state).used).toBe(7);
    new SetBoxConstruction(box.id, true).apply(state);
    const info = inventoryInfo(state);
    expect(info.used).toBe(0);
    expect(info.slots[0].storages[0].kept).toBe(true);
  });
});
