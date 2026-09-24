import { Container } from "pixi.js";
import { describe, expect, it } from "vitest";
import { createLayers } from "../../src/render/layers";
import { applyLod } from "../../src/render/lod";

describe("applyLod", () => {
  it("hides items in the overview only", () => {
    const layers = createLayers(new Container());
    applyLod(layers, "overview");
    expect(layers.items.visible).toBe(false);
    applyLod(layers, "graph");
    expect(layers.items.visible).toBe(true);
    applyLod(layers, "icons");
    expect(layers.items.visible).toBe(true);
  });
});
