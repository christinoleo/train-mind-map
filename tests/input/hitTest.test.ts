import { describe, expect, it } from "vitest";
import { CELL_PX, MIN_TOUCH_PX } from "../../src/config/constants";
import { depositAt, hitsRect } from "../../src/input/hitTest";
import { createGameState } from "../../src/sim/state/gameState";
import { isRevealed } from "../../src/sim/state/map";

describe("hitsRect", () => {
  const rect = { x: 100, y: 100, w: 32, h: 32 };

  it("hits inside the rect and misses well outside it", () => {
    expect(hitsRect(rect, 116, 116, 4)).toBe(true);
    expect(hitsRect(rect, 200, 116, 4)).toBe(false);
  });

  it(`grows a rect smaller than ${MIN_TOUCH_PX} px on screen about its centre`, () => {
    // At scale 0.5 the rect is 16 px on screen, so the target spans 88 world units.
    const half = MIN_TOUCH_PX / 0.5 / 2;
    expect(hitsRect(rect, 116 + half - 1, 116, 0.5)).toBe(true);
    expect(hitsRect(rect, 116 + half + 1, 116, 0.5)).toBe(false);
    expect(hitsRect(rect, 116, 116 - half + 1, 0.5)).toBe(true);
  });

  it("keeps a rect already large enough at its own size", () => {
    expect(hitsRect(rect, 133, 116, 4)).toBe(false);
  });
});

describe("depositAt", () => {
  const state = createGameState("hit-test");
  const cellCenter = (x: number, y: number) => ({
    x: (x + 0.5) * CELL_PX,
    y: (y + 0.5) * CELL_PX,
  });

  it("finds the revealed deposit under a point", () => {
    const deposit = state.map.deposits.find((d) =>
      isRevealed(state.map, d.x, d.y),
    )!;
    expect(depositAt(state, cellCenter(deposit.x, deposit.y))).toBe(deposit);
  });

  it("finds nothing off a deposit or outside the revealed area", () => {
    const hidden = state.map.deposits.find(
      (d) => !isRevealed(state.map, d.x, d.y),
    )!;
    expect(depositAt(state, cellCenter(hidden.x, hidden.y))).toBeUndefined();
    expect(depositAt(state, { x: -CELL_PX, y: -CELL_PX })).toBeUndefined();
  });
});
