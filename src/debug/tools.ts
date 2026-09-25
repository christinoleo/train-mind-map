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
import { CreateLine } from "../sim/commands/createLine";
import type { EventQueue } from "../sim/events";
import { ok, type Result } from "../sim/result";
import { resetGameState, type GameState } from "../sim/state/gameState";
import type { NodeId } from "../sim/state/ids";
import { strings } from "../ui/strings";
import { GiveItems, SetRevealedRing } from "./cheats";
import { DebugPanel } from "./DebugPanel";
import {
  drawCoreRings,
  drawHashBuckets,
  drawReservations,
  OverlayManager,
} from "./overlays";
import { PerfMonitor, type PerfSnapshot } from "./perf";
import { decodeReplay, encodeReplay } from "./replay";

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
  /** The world the game started on. */
  world: string | Scenario;
  /** Runs the offline path over `ms` of absence and shows its report. */
  goOffline(ms: number): void;
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
  replay: {
    /** The replay so far, as text (FR159). */
    export(): string;
    /** Saves the replay so far as a text file. */
    download(): void;
    /**
     * Restarts the game on a replay's world and plays its log again, at
     * the simulation speed.
     */
    load(text: string): Result;
  };
  cheats: {
    /** Simulation speed; 0 pauses, so queued commands wait until it resumes. */
    setSpeed(speed: number): void;
    /** Centres the camera on cell (x, y). */
    teleport(x: number, y: number): void;
    /** Queues a change of the outermost revealed ring. */
    revealRing(ring: number): Result;
    /** Queues `perItem` of every item into storage, up to capacity. */
    giveItems(perItem?: number): Result;
    /** Simulates `hours` of absence through the offline path (FR155). */
    offline(hours: number): void;
    /** Queues a Line over the Stations `stops`, with its first train. */
    createLine(...stops: number[]): Result;
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
    id: "reservations",
    label: strings.debug.reservations,
    draw: drawReservations,
    live: true,
  });
  // Like the map layers, overlays drop every GPU handle from the lost context.
  debug.app.canvas.addEventListener("webglcontextrestored", () =>
    overlays.invalidate(),
  );

  const dispatch = (command: Command) => commands.dispatch(state, command);
  const exportReplay = () =>
    encodeReplay(game.world, state.tick, commands.replayLog);
  const game: GameConsole = {
    ...debug,
    dispatch,
    regenerate(world = MVP_SCENARIO) {
      // The old game's commands and undo stack would act on the new one.
      commands.clear();
      resetGameState(state, world);
      game.world = world;
    },
    replay: {
      export: exportReplay,
      download() {
        const seed = state.map.seed;
        downloadText(
          `train-mind-map-replay-${seed}-${state.tick}.json`,
          exportReplay(),
        );
      },
      load(text) {
        const replay = decodeReplay(text);
        if (!replay.ok) return replay;
        game.regenerate(replay.value.world);
        commands.schedule(replay.value.log);
        return ok();
      },
    },
    cheats: {
      setSpeed(speed) {
        loop.speed = speed;
      },
      teleport: renderer.centerOn,
      revealRing: (ring) => dispatch(new SetRevealedRing(ring)),
      giveItems: (perItem = 100) => dispatch(new GiveItems(perItem)),
      offline: (hours) => debug.goOffline(hours * 3_600_000),
      createLine: (...stops) => dispatch(new CreateLine(stops as NodeId[])),
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

/** Hands the viewer `text` as a file named `name`. */
function downloadText(name: string, text: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
