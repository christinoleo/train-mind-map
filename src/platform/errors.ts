import { h } from "preact";
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
      showCrashScreen(() => hooks.exportSave?.() ?? exportLog());
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

function showCrashScreen(exportSave: () => Promise<string>) {
  showOverlay(
    h(CrashScreen, {
      onReload: () => location.reload(),
      onExport: exportSave,
    }),
  );
}
