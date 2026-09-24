import type { Lod } from "../input/camera";
import type { Layers } from "./layers";

/**
 * Shows each layer's detail for the camera's level of detail (FR13). The
 * overview draws no items: its edges show their item mix instead (FR149).
 */
export function applyLod(layers: Layers, lod: Lod) {
  layers.items.visible = lod !== "overview";
}
