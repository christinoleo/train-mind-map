import type { RawResource } from "../../data/items";
import { NODES, type NodeKind } from "../../data/nodes";
import {
  CRAFTERS,
  isCrafterKind,
  RECIPES,
  type RecipeId,
} from "../../data/recipes";
import { assert } from "../assert";
import { allCells, containsRect, overlaps, type Rect } from "../geometry/rect";
import { fail, ok, type Result } from "../result";
import type { FactoryNode, GameState } from "./gameState";
import type { NodeId } from "./ids";
import { isRevealed, MAP_RECT, Terrain, terrainAt } from "./map";
import { newProduction } from "./production";

/** What a node needs besides its place: an Extractor's resource, a crafter's recipe. */
export interface NodeSetup {
  resource?: RawResource;
  recipe?: RecipeId;
}

/** A fresh node, with empty buffers when it produces. */
export function createNode(
  id: NodeId,
  kind: NodeKind,
  x: number,
  y: number,
  { resource, recipe }: NodeSetup = {},
): FactoryNode {
  switch (kind) {
    case "extractor":
      assert(resource, "An Extractor needs a resource");
      return { id, kind, x, y, resource, production: newProduction() };
    case "furnace":
    case "assembler-1":
      return {
        id,
        kind,
        x,
        y,
        recipe: recipe ?? null,
        production: newProduction(),
      };
    default:
      return { id, kind, x, y };
  }
}

/** True when `kind` may run `recipe`: a Furnace smelts, an Assembler assembles. */
export function canRun(kind: NodeKind, recipe: RecipeId): boolean {
  return (
    isCrafterKind(kind) && CRAFTERS[kind].category === RECIPES[recipe].category
  );
}

/** The cells a node of `kind` covers with its top-left cell at (x, y). */
export function footprint(kind: NodeKind, x: number, y: number): Rect {
  const { size } = NODES[kind];
  return { x, y, w: size, h: size };
}

export function nodeRect(node: FactoryNode): Rect {
  return footprint(node.kind, node.x, node.y);
}

/** True when research, or the start, has made `kind` buildable (FR18). */
export function isUnlocked(
  state: Readonly<GameState>,
  kind: NodeKind,
): boolean {
  return state.unlockedNodes.includes(kind);
}

/**
 * Checks that a node of `kind` fits at (x, y): on revealed land, clear of
 * other nodes, and off deposits, except an Extractor, which must sit wholly
 * on one (FR17). On success it returns the resource under an
 * Extractor, or `undefined` for other kinds.
 */
export function checkFootprint(
  state: Readonly<GameState>,
  kind: NodeKind,
  x: number,
  y: number,
): Result<RawResource | undefined> {
  const { map } = state;
  const rect = footprint(kind, x, y);
  if (
    !containsRect(MAP_RECT, rect) ||
    !allCells(rect, (cx, cy) => isRevealed(map, cx, cy))
  ) {
    return fail("out_of_bounds");
  }
  for (const node of state.nodes.values()) {
    if (overlaps(rect, nodeRect(node))) {
      return fail("occupied");
    }
  }
  if (!allCells(rect, (cx, cy) => terrainAt(map, cx, cy) === Terrain.Land)) {
    return fail("on_water");
  }
  if (kind === "extractor") {
    const deposit = map.deposits.find((d) => containsRect(d, rect));
    return deposit ? ok(deposit.resource) : fail("needs_deposit");
  }
  if (map.deposits.some((d) => overlaps(rect, d))) return fail("on_deposit");
  return ok(undefined);
}
