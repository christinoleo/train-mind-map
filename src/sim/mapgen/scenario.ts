import { MAP_SIZE } from "../../config/constants";
import type { CellBlock, Scenario } from "../../data/scenarios/scenario";
import { assert } from "../assert";
import { allCells } from "../geometry/rect";
import { cellIndex, Terrain, terrainAt, type GameMap } from "../state/map";

/**
 * Stamps `scenario` over a generated map: water, then land, then the Core and
 * the deposits, which replace the generated ones. It returns a new map and
 * uses no randomness, so the same map and scenario always give the same result.
 */
export function applyScenario(map: GameMap, scenario: Scenario): GameMap {
  const terrain = [...map.terrain];
  const stamp = (block: CellBlock, type: Terrain) => {
    assertInMap(block);
    for (let y = block.y; y < block.y + block.h; y++) {
      for (let x = block.x; x < block.x + block.w; x++) {
        terrain[cellIndex(x, y)] = type;
      }
    }
  };
  scenario.water.forEach((block) => stamp(block, Terrain.Water));
  scenario.land.forEach((block) => stamp(block, Terrain.Land));

  const stamped: GameMap = {
    ...map,
    terrain,
    core: { ...scenario.core },
    deposits: scenario.deposits.map((d) => ({ ...d })),
    revealedRing: scenario.revealedRing,
  };
  for (const block of [stamped.core, ...stamped.deposits]) {
    assertInMap(block);
    assert(
      allCells(block, (x, y) => terrainAt(stamped, x, y) === Terrain.Land),
      `scenario places ${JSON.stringify(block)} on water`,
    );
  }
  return stamped;
}

function assertInMap({ x, y, w, h }: CellBlock) {
  assert(
    x >= 0 && y >= 0 && x + w <= MAP_SIZE && y + h <= MAP_SIZE,
    `scenario block ${JSON.stringify({ x, y, w, h })} is outside the map`,
  );
}
