import { h, type ComponentProps } from "preact";
import type { Result } from "../sim/result";
import { CrashScreen } from "../ui/CrashScreen";
import { showOverlay } from "../ui/overlay";
import { log, type LogEntry } from "./log";

export interface CrashHooks {
  /** Stops the simulation loop. */
  pause: () => void;
  /** Writes `save:crash` with the current state and the log buffer. */
  saveCrash?: (logEntries: LogEntry[]) => void;
  /**
   * What "Exportar save" copies: the save and the log buffer. Without it, or
   * when it returns `undefined` because there is no game yet, the log buffer
   * alone.
   */
  exportSave?: () => Promise<string> | undefined;
  /**
   * Writes a new game as the latest save; the crash screen reloads after
   * it, so a save that crashes on every load cannot trap the player.
   */
  newGame: () => Promise<void>;
  /** Makes the backup the latest save; the crash screen reloads after it. */
  loadBackup: () => Promise<Result<unknown>>;
}

/**
 * Bugs throw; this turns any uncaught error or rejection into a paused game
 * and the "Algo deu errado" screen. Expected failures never get here: they
 * return a Result.
 */
export function installErrorHandler(hooks: CrashHooks): void {
  let crashed = false;

  function crash(error: unknown) {
    if (crashed) return;
    crashed = true;
    log.error("ui", "uncaught error", describe(error));
    try {
      hooks.pause();
      hooks.saveCrash?.(log.entries());
    } finally {
      showCrashScreen(hooks);
    }
  }

  window.addEventListener("error", (event) =>
    crash(event.error ?? event.message),
  );
  window.addEventListener("unhandledrejection", (event) => crash(event.reason));
}

function describe(error: unknown) {
  return error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack }
    : { message: String(error) };
}

async function exportLog() {
  return JSON.stringify({ log: log.entries() }, null, 2);
}

function showCrashScreen(hooks: CrashHooks) {
  showOverlay(
    h(
      CrashScreen,
      crashActions(hooks, () => location.reload()),
    ),
  );
}

/**
 * What the crash screen's buttons do. Starting over writes the save and
 * reloads, since the game in memory may be what broke.
 */
export function crashActions(
  hooks: CrashHooks,
  reload: () => void,
): ComponentProps<typeof CrashScreen> {
  return {
    onReload: reload,
    onExport: () => hooks.exportSave?.() ?? exportLog(),
    async newGame() {
      // Reloads even if it failed: a crash loop still leaves the buttons.
      try {
        await hooks.newGame();
      } finally {
        reload();
      }
    },
    async loadBackup() {
      const result = await hooks.loadBackup();
      if (result.ok) reload();
      return result;
    },
  };
}
