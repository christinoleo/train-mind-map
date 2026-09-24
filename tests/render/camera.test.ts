import { describe, expect, it } from "vitest";
import { FIT_MARGIN, fitArea } from "../../src/render/camera";

describe("fitArea", () => {
  it("centres the area and fits its limiting side", () => {
    const area = { x: 100, y: 200, w: 400, h: 200 };
    const fit = fitArea(area, 400, 800);
    expect(fit.scale).toBeCloseTo(FIT_MARGIN);
    // The area's centre lands on the screen's centre.
    expect(fit.x + (area.x + area.w / 2) * fit.scale).toBeCloseTo(200);
    expect(fit.y + (area.y + area.h / 2) * fit.scale).toBeCloseTo(400);
  });
});
