import type { CommandQueue } from "./commands/commandQueue";
import type { Emit } from "./events";
import type { GameState } from "./state/gameState";
import { extraction } from "./systems/extraction";
import { flow } from "./systems/flow";
import { power } from "./systems/power";
import { production } from "./systems/production";
import { research } from "./systems/research";
import { stamina } from "./systems/stamina";
import { trains } from "./systems/trains";
import { updateStock } from "./systems/stock";

export interface SystemContext {
  emit: Emit;
}

/** One simulation system. Each tick lasts `TICK_MS`. */
export type System = (state: GameState, ctx: SystemContext) => void;

/**
 * The systems in their fixed order, after the queued commands: power
 * (satisfaction from the previous tick's demand), stamina and extraction,
 * production, edge flow, stations and trains, research, then stock and
 * statistics.
 * Each is added here by the task that builds it.
 */
export const SYSTEMS: readonly System[] = [
  power,
  stamina,
  extraction,
  production,
  flow,
  trains,
  research,
  updateStock,
];

/** Advances the state by one tick. */
export function tick(
  state: GameState,
  commands: CommandQueue,
  emit: Emit,
  systems: readonly System[] = SYSTEMS,
): void {
  commands.applyQueued(state, emit);
  const ctx: SystemContext = { emit };
  for (const system of systems) system(state, ctx);
  state.tick++;
}
