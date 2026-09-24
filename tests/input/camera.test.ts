import { describe, expect, it } from "vitest";
import {
  CAMERA_EDGE_PAD_PX,
  CELL_PX,
  LOD_GRAPH_CELL_PX,
  LOD_ICONS_CELL_PX,
  MAX_ZOOM_CELL_PX,
} from "../../src/config/constants";
import { Camera, FIT_MARGIN, fitArea, lodAt } from "../../src/input/camera";

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

describe("lodAt", () => {
  it("switches level at the configured pixels per cell", () => {
    const scaleFor = (cellPx: number) => cellPx / CELL_PX;
    expect(lodAt(scaleFor(LOD_GRAPH_CELL_PX - 0.1))).toBe("overview");
    expect(lodAt(scaleFor(LOD_GRAPH_CELL_PX))).toBe("graph");
    expect(lodAt(scaleFor(LOD_ICONS_CELL_PX - 0.1))).toBe("graph");
    expect(lodAt(scaleFor(LOD_ICONS_CELL_PX))).toBe("icons");
  });
});

/** A 1000 × 1000 world map on a 400 × 800 phone screen, fitted. */
function phoneCamera(): Camera {
  const camera = new Camera();
  camera.setViewport(400, 800);
  camera.setBounds({ x: 0, y: 0, w: 1000, h: 1000 }, true);
  return camera;
}

describe("Camera", () => {
  it("starts fitted on the map and cannot zoom out further", () => {
    const camera = phoneCamera();
    const fitted = camera.scale;
    expect(fitted).toBeCloseTo(0.4 * FIT_MARGIN);
    camera.zoomAt(200, 400, 0.5);
    expect(camera.scale).toBeCloseTo(fitted);
  });

  it("stops zooming in at the maximum", () => {
    const camera = phoneCamera();
    camera.zoomAt(200, 400, 1000);
    expect(camera.scale * CELL_PX).toBeCloseTo(MAX_ZOOM_CELL_PX);
  });

  it("zooms around the given screen point", () => {
    const camera = phoneCamera();
    camera.zoomAt(100, 100, 2);
    const before = camera.toWorld(150, 300);
    camera.zoomAt(150, 300, 1.5);
    const after = camera.toWorld(150, 300);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("pans with the finger and stops at the map's edge", () => {
    const camera = phoneCamera();
    camera.zoomAt(200, 400, 4);
    const x = camera.x;
    camera.panBy(-10, 0);
    expect(camera.x).toBeCloseTo(x - 10);
    camera.panBy(1e6, 1e6);
    // The map's top-left corner sits one pad inside the screen.
    expect(camera.x).toBeCloseTo(CAMERA_EDGE_PAD_PX);
    expect(camera.y).toBeCloseTo(CAMERA_EDGE_PAD_PX);
    camera.panBy(-1e6, -1e6);
    expect(camera.x + 1000 * camera.scale).toBeCloseTo(
      400 - CAMERA_EDGE_PAD_PX,
    );
    expect(camera.y + 1000 * camera.scale).toBeCloseTo(
      800 - CAMERA_EDGE_PAD_PX,
    );
  });

  it("keeps a map narrower than the screen centred", () => {
    const camera = phoneCamera();
    // Fitted, the map is 368 px tall on an 800 px screen.
    camera.panBy(0, 200);
    expect(camera.y + 500 * camera.scale).toBeCloseTo(400);
  });

  it("keeps the view centre in place when the screen resizes", () => {
    const camera = phoneCamera();
    camera.zoomAt(200, 400, 4);
    const centre = camera.toWorld(200, 400);
    camera.setViewport(420, 820);
    const after = camera.toWorld(210, 410);
    expect(after.x).toBeCloseTo(centre.x);
    expect(after.y).toBeCloseTo(centre.y);
  });

  it("keeps the view when the revealed map grows", () => {
    const camera = phoneCamera();
    camera.zoomAt(200, 400, 4);
    const { scale, x, y } = camera;
    camera.setBounds({ x: -500, y: -500, w: 2000, h: 2000 }, false);
    expect([camera.scale, camera.x, camera.y]).toEqual([scale, x, y]);
  });

  it("centres on a world point, within the map's limits", () => {
    const camera = phoneCamera();
    camera.zoomAt(200, 400, 4);
    camera.centerOn(500, 500);
    expect(camera.toWorld(200, 400).x).toBeCloseTo(500);
    expect(camera.toWorld(200, 400).y).toBeCloseTo(500);
    camera.centerOn(0, 0);
    expect(camera.x).toBeCloseTo(CAMERA_EDGE_PAD_PX);
  });
});
