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

/** The layer the player works on (FR78). */
export type Focus = "factory" | "rails";

/** The layers each focus keeps bright; the others dim. */
const FOCUS_LAYERS: Record<Focus, readonly LayerName[]> = {
  factory: ["edges", "items", "nodes"],
  rails: ["rails", "trains"],
};

/** Dims the layers out of `focus` to `alpha`, and shows the rest in full. */
export function applyFocus(layers: Layers, focus: Focus, alpha: number) {
  const other: Focus = focus === "factory" ? "rails" : "factory";
  for (const name of FOCUS_LAYERS[focus]) layers[name].alpha = 1;
  for (const name of FOCUS_LAYERS[other]) layers[name].alpha = alpha;
}
