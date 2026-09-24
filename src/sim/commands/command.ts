import type { Result } from "../result";
import type { GameState } from "../state/gameState";

/**
 * A single change to the game state. Every change the player makes is a
 * command; nothing else writes to the state outside the simulation systems.
 */
export interface Command {
  /** The command's name, verb + object in PascalCase (`PlaceNode`). */
  readonly type: string;
  /** Checks the command against the state. Expected failures return a reason. */
  validate(state: Readonly<GameState>): Result;
  /** Applies a validated command and captures what `invert()` needs. */
  apply(state: GameState): void;
  /** The command that undoes the last `apply`. */
  invert(): Command;
}
