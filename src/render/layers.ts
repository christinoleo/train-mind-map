import { Container } from "pixi.js";

/** Draw order, bottom first (architecture §Render). */
export const LAYER_ORDER = [
  "terrain",
  "deposits",
  "edges",
  "items",
  "nodes",
  "rails",
  "trains",
  "overlays",
] as const;

export type LayerName = (typeof LAYER_ORDER)[number];

export type Layers = Record<LayerName, Container>;

/** Adds one container per layer to `world`, in draw order. */
export function createLayers(world: Container): Layers {
  const layers = {} as Layers;
  for (const name of LAYER_ORDER) {
    layers[name] = world.addChild(new Container({ label: name }));
  }
  return layers;
}
