import { buildMeshes, powerMesh } from "../state/power";
import type { System } from "../tick";

/**
 * The first system of the tick: rebuilds the meshes after a change to the
 * nodes or edges, then sets each mesh's satisfaction from the previous
 * tick's demand (FR61, FR64).
 */
export const power: System = (state) => {
  if (state.power.dirty) state.power = buildMeshes(state);
  for (const mesh of state.power.meshes) powerMesh(state, mesh);
};
