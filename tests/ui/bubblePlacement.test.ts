import { describe, expect, it } from "vitest";
import { BUBBLE_GAP_PX, placeBubble } from "../../src/ui/bubblePlacement";

/** A 360 × 640 phone, the HUD down to 60 and the palette up from 560. */
const phone = { width: 360, height: 640, top: 60, bottom: 560 };
const size = { w: 240, h: 120 };

describe("placeBubble (FR19, FR59)", () => {
  it("sits above the node, centred, its arrow on the node's centre", () => {
    const node = { x: 140, y: 300, w: 80, h: 80 };
    expect(placeBubble(node, size, phone)).toEqual({
      x: 60,
      y: 300 - BUBBLE_GAP_PX - 120,
      below: false,
      arrowX: 120,
    });
  });

  it("flips below a node near the top, clear of the HUD", () => {
    const node = { x: 140, y: 100, w: 80, h: 80 };
    const p = placeBubble(node, size, phone);
    expect(p.below).toBe(true);
    expect(p.y).toBe(180 + BUBBLE_GAP_PX);
  });

  it("stays inside the screen by the sides, its arrow still on the node", () => {
    const left = placeBubble({ x: -20, y: 300, w: 60, h: 60 }, size, phone);
    expect(left.x).toBe(8);
    expect(left.arrowX).toBe(16);
    const right = placeBubble({ x: 330, y: 300, w: 60, h: 60 }, size, phone);
    expect(right.x).toBe(360 - 8 - 240);
    // The node's centre is past the bubble's corner: the arrow keeps inside.
    expect(right.arrowX).toBe(240 - 16);
  });

  it("keeps clear of the palette and the HUD when it fits on neither side", () => {
    // A node filling the screen: the bubble goes where there is more room, clamped.
    const big = { x: 0, y: 150, w: 360, h: 380 };
    const p = placeBubble(big, size, phone);
    expect(p.y).toBeGreaterThanOrEqual(phone.top);
    expect(p.y + size.h).toBeLessThanOrEqual(phone.bottom);
    // Off the bottom of the screen: pulled up above the palette.
    const low = placeBubble({ x: 140, y: 620, w: 0, h: 0 }, size, phone);
    expect(low.below).toBe(false);
    expect(low.y + size.h).toBeLessThanOrEqual(phone.bottom);
  });
});
