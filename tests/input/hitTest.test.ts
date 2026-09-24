import { describe, expect, it } from "vitest";
import { MIN_TOUCH_PX } from "../../src/config/constants";
import { hitsRect } from "../../src/input/hitTest";

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
