import type { CommandQueue } from "./commands/commandQueue";
import type { Emit } from "./events";
import type { GameState } from "./state/gameState";
import { extraction } from "./systems/extraction";
import { flow } from "./systems/flow";
import { power } from "./systems/power";
import { production } from "./systems/production";
import { research } from "./systems/research";
import { stamina } from "./systems/stamina";
import { updateStock } from "./systems/stock";

export interface SystemContext {
  emit: Emit;
  /** True while offline progress fast-forwards the game (ADR-0003). */
  offline: boolean;
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
  research,
  updateStock,
];

/** Advances the state by one tick; `offline` while fast-forwarding. */
export function tick(
  state: GameState,
  commands: CommandQueue,
  emit: Emit,
  systems: readonly System[] = SYSTEMS,
  offline = false,
): void {
  commands.applyQueued(state, emit);
  const ctx: SystemContext = { emit, offline };
  for (const system of systems) system(state, ctx);
  state.tick++;
}
