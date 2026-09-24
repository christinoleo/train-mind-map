import { describe, expect, it } from "vitest";
import { RAW_RESOURCES, type ItemId } from "../../src/data/items";
import {
  CRAFTERS,
  RECIPE_IDS,
  RECIPES,
  type RecipeCategory,
} from "../../src/data/recipes";
import { TICK_MS } from "../../src/config/constants";

describe("recipes", () => {
  it("are each named after the item they make", () => {
    for (const id of RECIPE_IDS) expect(RECIPES[id].output).toBe(id);
  });

  it("are all reachable from the raw resources", () => {
    const known = new Set<ItemId>(RAW_RESOURCES);
    let pending = [...RECIPE_IDS];
    while (pending.length > 0) {
      const ready = pending.filter((id) =>
        Object.keys(RECIPES[id].inputs).every((i) => known.has(i as ItemId)),
      );
      expect(ready, `unreachable: ${pending.join(", ")}`).not.toHaveLength(0);
      for (const id of ready) known.add(RECIPES[id].output);
      pending = pending.filter((id) => !ready.includes(id));
    }
  });

  it("have a node to run them, taking a whole number of ticks there", () => {
    const categories = new Set<RecipeCategory>();
    for (const { category, speed } of Object.values(CRAFTERS)) {
      categories.add(category);
      for (const id of RECIPE_IDS) {
        if (RECIPES[id].category !== category) continue;
        const ticks = (RECIPES[id].seconds * 1000) / TICK_MS / speed;
        expect(ticks).toBeCloseTo(Math.round(ticks));
      }
    }
    for (const id of RECIPE_IDS) {
      expect(categories.has(RECIPES[id].category)).toBe(true);
    }
  });
});
