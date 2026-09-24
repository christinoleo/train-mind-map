import type { Application, WebGLRenderer } from "pixi.js";
import type { Loop } from "../loop";
import type { CommandQueue } from "../sim/commands/commandQueue";
import type { EventQueue } from "../sim/events";
import type { GameState } from "../sim/state/gameState";

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
  }
}

export function installDebugTools(game: DebugGame) {
  window.game = game;
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
