import type { Application, WebGLRenderer } from "pixi.js";
import type { Camera } from "../input/camera";
import type { Controls } from "../input/controls";
import { MVP_SCENARIO } from "../data/scenarios/mvp";
import type { Scenario } from "../data/scenarios/scenario";
import { h, render } from "preact";
import type { Loop } from "../loop";
import type { Renderer } from "../render/renderer";
import type { Command } from "../sim/commands/command";
import type { CommandQueue } from "../sim/commands/commandQueue";
import type { EventQueue } from "../sim/events";
import type { Result } from "../sim/result";
import { resetGameState, type GameState } from "../sim/state/gameState";
import { strings } from "../ui/strings";
import { GiveItems, SetRevealedRing } from "./cheats";
import { DebugPanel } from "./DebugPanel";
import {
  drawCoreRings,
  drawHashBuckets,
  drawPowerMeshes,
  OverlayManager,
} from "./overlays";
import { PerfMonitor, type PerfSnapshot } from "./perf";

/** What main.ts hands to the debug tools. */
export interface DebugGame {
  state: GameState;
  commands: CommandQueue;
  events: EventQueue;
  loop: Loop;
  app: Application;
  renderer: Renderer;
  camera: Camera;
  controls: Controls;
}

/** `window.game`: the live game for the DevTools console and for agents. */
export interface GameConsole extends DebugGame {
  /** Validates and queues a command for the next tick. */
  dispatch(command: Command): Result;
  /**
   * Restarts the game on a free seed's map, or on a scenario (the MVP one by
   * default), dropping queued commands and undo.
   */
  regenerate(world?: string | Scenario): void;
  cheats: {
    /** Simulation speed; 0 pauses, so queued commands wait until it resumes. */
    setSpeed(speed: number): void;
    /** Centres the camera on cell (x, y). */
    teleport(x: number, y: number): void;
    /** Queues a change of the outermost revealed ring. */
    revealRing(ring: number): Result;
    /** Queues `perItem` of every item into storage, up to capacity. */
    giveItems(perItem?: number): Result;
  };
  overlays: OverlayManager;
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
    game?: GameConsole;
    /** Superadmin: `window.game.regenerate`, kept at the top level for the console. */
    regenerate?: GameConsole["regenerate"];
  }
}

export function installDebugTools(debug: DebugGame) {
  const { state, commands, loop, renderer } = debug;
  const overlays = new OverlayManager(renderer.layers.overlays, state);
  overlays.register({
    id: "core-rings",
    label: strings.debug.coreRings,
    draw: drawCoreRings,
  });
  overlays.register({
    id: "hash-buckets",
    label: strings.debug.hashBuckets,
    draw: drawHashBuckets,
    live: true,
  });
  overlays.register({
    id: "power-meshes",
    label: strings.debug.powerMeshes,
    draw: drawPowerMeshes,
    live: true,
  });
  // Like the map layers, overlays drop every GPU handle from the lost context.
  debug.app.canvas.addEventListener("webglcontextrestored", () =>
    overlays.invalidate(),
  );

  const dispatch = (command: Command) => commands.dispatch(state, command);
  const game: GameConsole = {
    ...debug,
    dispatch,
    regenerate(world = MVP_SCENARIO) {
      // The old game's commands and undo stack would act on the new one.
      commands.clear();
      resetGameState(state, world);
    },
    cheats: {
      setSpeed(speed) {
        loop.speed = speed;
      },
      teleport: renderer.centerOn,
      revealRing: (ring) => dispatch(new SetRevealedRing(ring)),
      giveItems: (perItem = 100) => dispatch(new GiveItems(perItem)),
    },
    overlays,
  };

  window.game = game;
  window.regenerate = game.regenerate;
  window.crash = () => {
    setTimeout(() => {
      throw new Error("debug crash");
    });
  };
  window.loseContext = (restoreAfterMs = 1000) => {
    const { gl } = debug.app.renderer as WebGLRenderer;
    const ext = gl.getExtension("WEBGL_lose_context");
    if (!ext) throw new Error("WEBGL_lose_context is not available");
    ext.loseContext();
    setTimeout(() => ext.restoreContext(), restoreAfterMs);
  };

  // The debug tools run their own frame callback, so the game loop carries no
  // debug code: it samples the loop's timings and keeps the overlays current.
  const monitor = new PerfMonitor();
  const listeners = new Set<(snapshot: PerfSnapshot) => void>();
  const onFrame = (time: number) => {
    overlays.refresh();
    if (monitor.sample(time, loop.timings)) {
      for (const listener of listeners) listener(monitor.snapshot);
    }
    requestAnimationFrame(onFrame);
  };
  requestAnimationFrame(onFrame);

  const root = document.createElement("div");
  root.id = "debug-root";
  document.body.appendChild(root);
  render(
    h(DebugPanel, {
      game,
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    }),
    root,
  );
}
