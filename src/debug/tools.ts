import type { Application, WebGLRenderer } from "pixi.js";
import { MVP_SCENARIO } from "../data/scenarios/mvp";
import type { Scenario } from "../data/scenarios/scenario";
import type { Loop } from "../loop";
import type { CommandQueue } from "../sim/commands/commandQueue";
import type { EventQueue } from "../sim/events";
import { createGameState, type GameState } from "../sim/state/gameState";

export interface DebugGame {
  state: GameState;
  commands: CommandQueue;
  events: EventQueue;
  loop: Loop;
  app: Application;
}

declare global {
  interface Window {
    /** Throws an uncaught error, to exercise the crash screen. */
    crash?: () => void;
    /**
     * Loses the WebGL context and restores it `restoreAfterMs` later, to
     * exercise context-loss recovery.
     */
    loseContext?: (restoreAfterMs?: number) => void;
    /** The live game, for the DevTools console. */
    game?: DebugGame;
    /**
     * Superadmin: restarts the game on a free seed's map, or on a scenario,
     * the MVP one by default.
     */
    regenerate?: (world?: string | Scenario) => void;
  }
}

export function installDebugTools(game: DebugGame) {
  window.game = game;
  window.regenerate = (world = MVP_SCENARIO) => {
    // The old game's commands and undo stack would act on the new one.
    game.commands.clear();
    Object.assign(game.state, createGameState(world));
  };
  window.crash = () => {
    setTimeout(() => {
      throw new Error("debug crash");
    });
  };
  window.loseContext = (restoreAfterMs = 1000) => {
    const { gl } = game.app.renderer as WebGLRenderer;
    const ext = gl.getExtension("WEBGL_lose_context");
    if (!ext) throw new Error("WEBGL_lose_context is not available");
    ext.loseContext();
    setTimeout(() => ext.restoreContext(), restoreAfterMs);
  };
}
