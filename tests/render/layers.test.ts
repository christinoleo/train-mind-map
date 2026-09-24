import { Container } from "pixi.js";
import { describe, expect, it } from "vitest";
import { createLayers, LAYER_ORDER } from "../../src/render/layers";

describe("createLayers", () => {
  it("stacks the layers bottom to top in the architecture's order", () => {
    const world = new Container();
    const layers = createLayers(world);
    expect(world.children.map((c) => c.label)).toEqual([...LAYER_ORDER]);
    expect(world.children).toEqual(LAYER_ORDER.map((name) => layers[name]));
  });
});
