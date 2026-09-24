import { h, render } from "preact";
import { CrashScreen } from "../ui/CrashScreen";
import { log, type LogEntry } from "./log";

export interface CrashHooks {
  /** Stops the simulation loop. */
  pause: () => void;
  /** Writes `save:crash` with the current state and the log buffer (Epic 4). */
  saveCrash?: (logEntries: LogEntry[]) => void;
  /** Serialises what "Exportar save" copies; until saves exist, the log buffer. */
  exportSave?: () => string;
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
      showCrashScreen(hooks.exportSave ?? exportLog);
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

function exportLog() {
  return JSON.stringify({ log: log.entries() }, null, 2);
}

// A separate root, so the screen still renders if the UI tree is what broke.
function showCrashScreen(exportSave: () => string) {
  const root = document.createElement("div");
  document.body.appendChild(root);
  render(
    h(CrashScreen, {
      onReload: () => location.reload(),
      // async, so a missing clipboard (plain http) or a failing export rejects.
      onExport: async () => navigator.clipboard.writeText(exportSave()),
    }),
    root,
  );
}
