import type { RawResource } from "../../data/items";
import { NODES, type NodeKind } from "../../data/nodes";
import {
  CRAFTERS,
  isCrafterKind,
  RECIPES,
  type RecipeId,
} from "../../data/recipes";
import { assert } from "../assert";
import { allCells, containsCell, overlaps, type Rect } from "../geometry/rect";
import { railCells } from "../rail/route";
import { fail, ok, type Result } from "../result";
import { edgeCrosses, pathBounds } from "./edges";
import type { FactoryNode, GameState, Rail } from "./gameState";
import type { NodeId } from "./ids";
import { depositUnder, isRevealedRect, Terrain, terrainAt } from "./map";
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
    case "assembler-2":
      return {
        id,
        kind,
        x,
        y,
        recipe: recipe ?? null,
        production: newProduction(),
      };
    case "core":
    case "station":
      return { id, kind, x, y, items: [] };
    case "box":
      return { id, kind, x, y, items: [], noConstruction: false };
    case "splitter":
    case "merger":
      return { id, kind, x, y, next: 0, blocked: false };
    case "generator":
      return { id, kind, x, y, fuel: 0, burn: 0 };
    case "lab":
      return { id, kind, x, y, production: newProduction(), research: null };
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

export function nodeRect(node: Pick<FactoryNode, "kind" | "x" | "y">): Rect {
  return footprint(node.kind, node.x, node.y);
}

/** True when any node, bar those `ignore` skips, covers a cell of `rect`. */
export function isOccupied(
  state: {
    readonly nodes: ReadonlyMap<NodeId, Pick<FactoryNode, "kind" | "x" | "y">>;
  },
  rect: Rect,
  ignore?: (node: Pick<FactoryNode, "kind">) => boolean,
): boolean {
  for (const node of state.nodes.values()) {
    if (ignore?.(node)) continue;
    if (overlaps(rect, nodeRect(node))) return true;
  }
  return false;
}

/**
 * True when a rail runs through a cell of `rect`, or through a corner of it:
 * a diagonal step needs both cells beside it free (FR81).
 */
export function railCrosses(state: Readonly<GameState>, rect: Rect): boolean {
  for (const rail of state.rails.values()) {
    if (railHitsRect(rail, rect)) return true;
  }
  return false;
}

/** True when `rail` runs through a cell or a corner of `rect` (FR81). */
export function railHitsRect(rail: Readonly<Rail>, rect: Rect): boolean {
  if (!overlaps(pathBounds(rail.path), rect)) return false;
  const cells = railCells(rail.path);
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (containsCell(rect, c.x, c.y)) return true;
    const prev = cells[i - 1];
    if (prev && prev.x !== c.x && prev.y !== c.y) {
      if (containsCell(rect, c.x, prev.y) || containsCell(rect, prev.x, c.y)) {
        return true;
      }
    }
  }
  return false;
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
 * other nodes and edges, and off deposits, except an Extractor, which must sit wholly
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
  if (!isRevealedRect(map, rect)) return fail("out_of_bounds");
  if (isOccupied(state, rect)) return fail("occupied");
  if (edgeCrosses(state, rect)) return fail("crosses_edge");
  if (railCrosses(state, rect)) return fail("crosses_rail");
  if (!allCells(rect, (cx, cy) => terrainAt(map, cx, cy) === Terrain.Land)) {
    return fail("on_water");
  }
  if (kind === "extractor") {
    const deposit = depositUnder(map, rect);
    return deposit ? ok(deposit.resource) : fail("needs_deposit");
  }
  if (map.deposits.some((d) => overlaps(rect, d))) return fail("on_deposit");
  return ok(undefined);
}
