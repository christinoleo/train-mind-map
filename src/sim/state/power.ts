import { CORE_POWER, GENERATOR, POWER_DEMAND } from "../../data/power";
import type { FactoryNode, GameState, GeneratorNode } from "./gameState";
import { secondsToTicks } from "./production";

/**
 * The power grid (FR61, FR64): one map-wide pool that every Generator and
 * the Core feed and every node draws from. Recomputed each tick and never
 * saved.
 */
export interface Power {
  /** The ⚡ the Core and the Generators give this tick. */
  supply: number;
  /** The ⚡ the operating nodes drew in the previous tick. */
  demand: number;
  /** How fast every node works this tick, from 0 to 1 (FR64). */
  satisfaction: number;
}

export function newPower(): Power {
  return { supply: 0, demand: 0, satisfaction: 1 };
}

/** Ticks one fuel item burns for. */
export const BURN_TICKS = secondsToTicks(GENERATOR.seconds);

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
 * Sets the grid's demand, supply and satisfaction for this tick. Generators
 * burn fuel only while something draws power. With no supply every node
 * stands still, which cannot happen while the Core stands; with no demand
 * they would run at full speed (FR64, FR67).
 */
export function powerGrid(state: GameState): void {
  let demand = 0;
  for (const node of state.nodes.values()) demand += demandOf(node);
  let supply = 0;
  for (const node of state.nodes.values()) {
    if (node.kind === "core") supply += CORE_POWER;
    else if (node.kind === "generator") {
      // With nothing drawing, it runs only while it has fuel to burn.
      const runs = demand > 0 ? burn(node) : node.burn > 0 || node.fuel > 0;
      if (runs) supply += GENERATOR.power;
    }
  }
  const { power } = state;
  power.demand = demand;
  power.supply = supply;
  power.satisfaction =
    supply === 0 ? 0 : demand === 0 ? 1 : Math.min(1, supply / demand);
}

/** True when the grid draws more than it gets (FR65). */
export function isShort(
  power: Readonly<Pick<Power, "supply" | "demand">>,
): boolean {
  return power.demand > power.supply;
}

/** What the HUD's ⚡ meter shows (FR131). */
export interface PowerSummary {
  supply: number;
  demand: number;
  short: boolean;
}

export function powerSummary(power: Readonly<Power>): PowerSummary {
  const { supply, demand } = power;
  return { supply, demand, short: isShort(power) };
}
