import { addCounts, type ItemCounts } from "../../data/items";
import type { RecipeId } from "../../data/recipes";
import type { Emit } from "../events";
import { buildPlanarIndex } from "../geometry/planar";
import { fail, ok, type Result } from "../result";
import { checkRestore, connectorCell, matchInputPort } from "../state/edges";
import type { CrafterNode, Edge, GameState } from "../state/gameState";
import type { EdgeId, NodeId } from "../state/ids";
import { canRun } from "../state/nodes";
import {
  canFeed,
  inputTypes,
  isCrafter,
  newProduction,
} from "../state/production";
import { canAfford } from "../state/stock";
import type { Command } from "./command";
import { dropEdge, putBackEdge } from "./removeEdge";

/** What a change of recipe does to the edges of the node. */
export interface RecipeChange {
  /** The edges that no longer fit and are disconnected (FR25). */
  dropped: Edge[];
  /** The input edges that stay but move to another port. */
  moved: { id: EdgeId; toPort: number }[];
}

/**
 * What giving crafter `node` recipe `recipe` does to its edges (FR25). An
 * input edge stays when the new recipe has an input for what its source
 * sends, on a free connector in the same cell, so its route still joins; it
 * moves to that port. Every other input edge is disconnected, and so is
 * each output edge into a typed input that the new product does not fit.
 */
export function recipeChange(
  state: Readonly<GameState>,
  node: Readonly<CrafterNode>,
  recipe: RecipeId | null,
): RecipeChange {
  const next = { ...node, recipe };
  const dropped: Edge[] = [];
  const moved: RecipeChange["moved"] = [];
  const taken = new Set<number>();
  for (const edge of state.edges.values()) {
    if (edge.from === node.id) {
      const target = state.nodes.get(edge.to);
      if (target && !canFeed(next, inputTypes(target)[edge.toPort])) {
        dropped.push(edge);
      }
      continue;
    }
    if (edge.to !== node.id) continue;
    const source = state.nodes.get(edge.from);
    const cell = connectorCell(node, "input", edge.toPort);
    const port = source ? matchInputPort(next, source, cell, taken) : -1;
    if (port === -1) {
      dropped.push(edge);
      continue;
    }
    taken.add(port);
    if (port !== edge.toPort) moved.push({ id: edge.id, toPort: port });
  }
  return { dropped, moved };
}

/**
 * Checks that every input `node` has under `recipe`, bar those an edge will
 * end at, lies on a free cell once `change`'s dropped edges are gone: a new
 * input under another edge or a node could never be connected (FR25).
 */
function checkInputCells(
  state: Readonly<GameState>,
  node: Readonly<CrafterNode>,
  recipe: RecipeId | null,
  { dropped }: RecipeChange,
): Result {
  const next = { ...node, recipe };
  const index = buildPlanarIndex(state);
  for (const edge of dropped) index.removeEdge(edge.id);
  const ends = new Set<string>();
  for (const edge of state.edges.values()) {
    if (edge.to !== node.id || dropped.includes(edge)) continue;
    const end = edge.path[edge.path.length - 1];
    ends.add(`${end.x},${end.y}`);
  }
  for (let port = 0; port < inputTypes(next).length; port++) {
    const cell = connectorCell(next, "input", port);
    if (ends.has(`${cell.x},${cell.y}`)) continue;
    const obstacle = index.obstacleAt(cell.x, cell.y);
    if (obstacle)
      return fail(obstacle.kind === "edge" ? "crosses_edge" : "occupied");
  }
  return ok();
}

/** Moves each edge in `moved` onto its new port. */
function movePorts(
  edges: Map<EdgeId, Edge>,
  moved: RecipeChange["moved"],
): void {
  for (const { id, toPort } of moved) {
    edges.set(id, { ...edges.get(id)!, toPort });
  }
}

/** An edge a change of recipe disconnected, and what it gave back. */
interface Dropped {
  edge: Edge;
  refunded: ItemCounts;
}

/**
 * Sets the recipe a Furnace or Assembler runs (FR27). Changing it loses the
 * items inside the node, and disconnects the edges that no longer fit its
 * typed inputs, or its product, refunding their cost and the items on them
 * (FR25); its undo sets the old recipe back on empty buffers and puts those
 * edges back. It is refused when a new input would sit under another edge
 * or a node. `null` leaves it without one: a Furnace then smelts whatever
 * ore reaches it, and an Assembler idles.
 */
export class SetRecipe implements Command {
  readonly type = "SetRecipe";
  private from?: RecipeId | null;
  private dropped: Dropped[] = [];

  constructor(
    readonly id: NodeId,
    readonly recipe: RecipeId | null,
  ) {}

  validate(state: Readonly<GameState>): Result {
    const node = state.nodes.get(this.id);
    if (!node || !isCrafter(node)) return fail("not_found");
    // `null` clears the recipe: a new Assembler has none, so its undo needs it.
    if (this.recipe !== null && !canRun(node.kind, this.recipe)) {
      return fail("wrong_recipe");
    }
    const change = recipeChange(state, node, this.recipe);
    return checkInputCells(state, node, this.recipe, change);
  }

  apply(state: GameState) {
    const node = state.nodes.get(this.id)!;
    if (!isCrafter(node))
      throw new Error("SetRecipe applied without validating");
    this.from = node.recipe;
    const { dropped, moved } = recipeChange(state, node, this.recipe);
    this.dropped = dropped.map((edge) => ({
      edge,
      refunded: dropEdge(state, edge),
    }));
    movePorts(state.edges, moved);
    state.nodes.set(this.id, {
      ...node,
      recipe: this.recipe,
      running: null,
      production: newProduction(),
    });
  }

  invert(): Command {
    if (this.from === undefined) throw new Error("SetRecipe was not applied");
    return new RestoreRecipe(this.id, this.from, this.dropped);
  }
}

/**
 * The undo of `SetRecipe`: the old recipe on empty buffers, the input edges
 * that stayed back on their old ports, and the edges it disconnected back,
 * empty, taking back what they refunded.
 */
class RestoreRecipe implements Command {
  readonly type = "RestoreRecipe";

  constructor(
    private readonly id: NodeId,
    private readonly recipe: RecipeId | null,
    private readonly dropped: readonly Dropped[],
  ) {}

  validate(state: Readonly<GameState>): Result {
    const node = state.nodes.get(this.id);
    if (!node || !isCrafter(node)) return fail("not_found");
    const back = { ...node, recipe: this.recipe };
    // Edges connected since must still fit the old recipe.
    const change = recipeChange(state, node, this.recipe);
    const { dropped, moved } = change;
    if (dropped.length > 0) return fail("connector_taken");
    // The dropped edges come back beside the kept ones, on their old ports.
    const after = { ...state, edges: new Map(state.edges) };
    movePorts(after.edges, moved);
    const index = buildPlanarIndex(state);
    const refund: ItemCounts = {};
    for (const { edge, refunded } of this.dropped) {
      if (state.edges.has(edge.id)) return fail("occupied");
      const fits = checkRestore(after, index, edge, back);
      if (!fits.ok) return fits;
      index.addEdge(edge.id, edge.path);
      addCounts(refund, refunded);
    }
    if (!canAfford(state, refund)) return fail("no_stock");
    // The restored edges end at their own inputs; the others must be clear.
    const withBack = { ...after, edges: new Map(after.edges) };
    for (const { edge } of this.dropped) withBack.edges.set(edge.id, edge);
    return checkInputCells(withBack, node, this.recipe, change);
  }

  apply(state: GameState, emit: Emit) {
    const node = state.nodes.get(this.id)!;
    if (!isCrafter(node)) {
      throw new Error("RestoreRecipe applied without validating");
    }
    const { moved } = recipeChange(state, node, this.recipe);
    movePorts(state.edges, moved);
    state.nodes.set(this.id, {
      ...node,
      recipe: this.recipe,
      running: null,
      production: newProduction(),
    });
    for (const { edge, refunded } of this.dropped) {
      putBackEdge(state, edge, refunded, emit);
    }
  }

  invert(): Command {
    return new SetRecipe(this.id, this.recipe);
  }
}
