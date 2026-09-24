import type { Loop } from "../loop";
import type { CommandQueue } from "../sim/commands/commandQueue";
import type { EventQueue } from "../sim/events";
import type { GameState } from "../sim/state/gameState";

export interface DebugGame {
  state: GameState;
  commands: CommandQueue;
  events: EventQueue;
  loop: Loop;
}

declare global {
  interface Window {
    /** Throws an uncaught error, to exercise the crash screen. */
    crash?: () => void;
    /** The live game, for the DevTools console. */
    game?: DebugGame;
  }
}

export function installDebugTools(game: DebugGame) {
  window.game = game;
  window.crash = () => {
    setTimeout(() => {
      throw new Error("debug crash");
    });
  };
}
