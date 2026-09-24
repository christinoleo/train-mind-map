export type LogLevel = "error" | "warn" | "info" | "debug";

export type LogModule =
  "sim" | "rail" | "power" | "input" | "render" | "save" | "ui" | "audio";

export interface LogEntry {
  time: number;
  level: LogLevel;
  module: LogModule;
  msg: string;
  data?: unknown;
}

type LogFn = (module: LogModule, msg: string, data?: unknown) => void;

export interface Logger {
  error: LogFn;
  warn: LogFn;
  info: LogFn;
  debug: LogFn;
  /** The buffered warn and error entries, oldest first, for save export. */
  entries(): LogEntry[];
}

export const LOG_BUFFER_SIZE = 200;

export interface LoggerOptions {
  /** Echo every level to the console. */
  console: boolean;
  capacity?: number;
  now?: () => number;
}

export function createLogger({
  console: toConsole,
  capacity = LOG_BUFFER_SIZE,
  now = Date.now,
}: LoggerOptions): Logger {
  // Ring buffer: `next` is the slot the next entry overwrites.
  const buffer: LogEntry[] = [];
  let next = 0;

  function write(level: LogLevel): LogFn {
    return (module, msg, data) => {
      if (toConsole) {
        const args = data === undefined ? [] : [data];
        console[level](`[${module}] ${msg}`, ...args);
      }
      if (level !== "error" && level !== "warn") return;
      const entry: LogEntry = { time: now(), level, module, msg };
      if (data !== undefined) entry.data = data;
      buffer[next] = entry;
      next = (next + 1) % capacity;
    };
  }

  return {
    error: write("error"),
    warn: write("warn"),
    info: write("info"),
    debug: write("debug"),
    entries: () => [...buffer.slice(next), ...buffer.slice(0, next)],
  };
}

// The one global singleton the architecture allows. Never call it from the
// hot tick loop; use aggregate counters in the debug overlay instead.
export const log = createLogger({ console: import.meta.env.DEV });
