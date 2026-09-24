import { CORE_POWER, GENERATOR, POWER_DEMAND } from "../../data/power";
import type { Edge, FactoryNode, GameState, GeneratorNode } from "./gameState";
import type { NodeId } from "./ids";
import { secondsToTicks } from "./production";

/**
 * A connected group of nodes joined by edges, which shares one power supply
 * (FR61). Rails join meshes in Epic 5.
 */
export interface Mesh {
  nodes: NodeId[];
  /** The ⚡ its Core and Generators give this tick. */
  supply: number;
  /** The ⚡ its operating nodes drew in the previous tick. */
  demand: number;
  /** How fast its nodes work this tick, from 0 to 1 (FR64). */
  satisfaction: number;
}

/**
 * The power meshes: a derived cache, rebuilt by the power system after any
 * change to the nodes or edges, and never saved.
 */
export interface Power {
  meshes: Mesh[];
  meshOf: Map<NodeId, Mesh>;
  /** True when the nodes or edges changed since the meshes were built. */
  dirty: boolean;
}

export function newPower(): Power {
  return { meshes: [], meshOf: new Map(), dirty: true };
}

/** Marks the meshes stale; the command queue calls it after every command. */
export function topologyChanged(state: GameState): void {
  state.power.dirty = true;
}

/** Ticks one fuel item burns for. */
export const BURN_TICKS = secondsToTicks(GENERATOR.seconds);

/**
 * Groups the nodes into meshes with a union-find over the edges (FR61). The
 * meshes come in the order of their first node, and their supply and demand
 * start at zero.
 */
export function buildMeshes(state: Readonly<GameState>): Power {
  const parent = new Map<NodeId, NodeId>();
  for (const id of state.nodes.keys()) parent.set(id, id);
  const root = (id: NodeId): NodeId => {
    let r = id;
    while (parent.get(r) !== r) r = parent.get(r)!;
    // Path compression: every node on the way points at the root.
    while (id !== r) {
      const next = parent.get(id)!;
      parent.set(id, r);
      id = next;
    }
    return r;
  };
  for (const { from, to } of state.edges.values()) {
    parent.set(root(from), root(to));
  }
  const meshes: Mesh[] = [];
  const byRoot = new Map<NodeId, Mesh>();
  const meshOf = new Map<NodeId, Mesh>();
  for (const id of state.nodes.keys()) {
    const r = root(id);
    let mesh = byRoot.get(r);
    if (!mesh) {
      mesh = { nodes: [], supply: 0, demand: 0, satisfaction: 0 };
      byRoot.set(r, mesh);
      meshes.push(mesh);
    }
    mesh.nodes.push(id);
    meshOf.set(id, mesh);
  }
  return { meshes, meshOf, dirty: false };
}

/**
 * The ⚡ `node` drew in the previous tick: its rate while it was operating,
 * neither starved nor blocked (FR63, FR64), and nothing otherwise.
 */
function demandOf(node: FactoryNode): number {
  const rate = POWER_DEMAND[node.kind] ?? 0;
  if (rate === 0 || !("production" in node)) return 0;
  const { status } = node.production;
  return status === "starved" || status === "blocked" ? 0 : rate;
}

/**
 * Burns one tick of fuel, starting a new item when the last one is spent,
 * and returns whether the Generator ran (FR32).
 */
function burn(node: GeneratorNode): boolean {
  if (node.burn === 0) {
    if (node.fuel === 0) return false;
    node.fuel--;
    node.burn = BURN_TICKS;
  }
  node.burn--;
  return true;
}

/**
 * Sets `mesh`'s demand, supply and satisfaction for this tick. Generators
 * burn fuel only while the mesh draws power. With no supply the mesh stands
 * still; with no demand it would run at full speed (FR64, FR67).
 */
export function powerMesh(state: GameState, mesh: Mesh): void {
  let demand = 0;
  for (const id of mesh.nodes) demand += demandOf(state.nodes.get(id)!);
  let supply = 0;
  for (const id of mesh.nodes) {
    const node = state.nodes.get(id)!;
    if (node.kind === "core") supply += CORE_POWER;
    else if (node.kind === "generator") {
      // With nothing drawing, it runs only while it has fuel to burn.
      const runs = demand > 0 ? burn(node) : node.burn > 0 || node.fuel > 0;
      if (runs) supply += GENERATOR.power;
    }
  }
  mesh.demand = demand;
  mesh.supply = supply;
  mesh.satisfaction =
    supply === 0 ? 0 : demand === 0 ? 1 : Math.min(1, supply / demand);
}

/** How fast node `id` works this tick: its mesh's satisfaction. */
export function satisfactionOf(state: Readonly<GameState>, id: NodeId): number {
  return state.power.meshOf.get(id)?.satisfaction ?? 0;
}

/** True when `mesh` draws more than it gets (FR65). */
export function isShort(
  mesh: Readonly<Pick<Mesh, "supply" | "demand">>,
): boolean {
  return mesh.demand > mesh.supply;
}

/** The mesh `edge` conducts power in: the one its nodes share. */
export function meshOfEdge<M>(
  power: { readonly meshOf: ReadonlyMap<NodeId, M> },
  edge: Readonly<Pick<Edge, "from">>,
): M | undefined {
  return power.meshOf.get(edge.from);
}

/** What the HUD's ⚡ meter shows: every mesh added up (FR131). */
export interface PowerSummary {
  supply: number;
  demand: number;
  /** True when any mesh draws more than it gets. */
  short: boolean;
}

export function powerSummary(power: Readonly<Power>): PowerSummary {
  const summary: PowerSummary = { supply: 0, demand: 0, short: false };
  for (const mesh of power.meshes) {
    summary.supply += mesh.supply;
    summary.demand += mesh.demand;
    summary.short ||= isShort(mesh);
  }
  return summary;
}
