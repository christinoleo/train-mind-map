import type { Rect } from "../../../src/sim/geometry/rect";
import { createGameState } from "../../../src/sim/state/gameState";
import { cellIndex, Terrain, type GameMap } from "../../../src/sim/state/map";

/** A map of land only, with `water` blocks stamped on it. */
export function landMap(...water: Rect[]): GameMap {
  const { map } = createGameState("geometry");
  map.terrain.fill(Terrain.Land);
  for (const r of water) {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        map.terrain[cellIndex(x, y)] = Terrain.Water;
      }
    }
  }
  return map;
}
