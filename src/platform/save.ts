// The save (FR126–FR129): the game state as versioned JSON in IndexedDB, an
// autosave every 30 s and when the tab goes away, a backup of the previous
// save, and export and import as text for when the browser drops its storage.

import { createStore, get, setMany } from "idb-keyval";
import { version as GAME_VERSION } from "../../package.json";
import { AUTOSAVE_MS, STORAGE_PREFIX } from "../config/constants";
import { fail, ok, type FailReason, type Result } from "../sim/result";
import type { GameState } from "../sim/state/gameState";
import {
  deserializeState,
  hashState,
  toPairs,
  type SerializedState,
} from "../sim/state/serialize";
import { log, type LogEntry } from "./log";

/** Bumped whenever the saved state changes shape; add a migration with it. */
export const SCHEMA_VERSION = 3;

export const SAVE_KEYS = {
  /** The latest save. */
  auto: `${STORAGE_PREFIX}save:auto`,
  /** The save before it, offered when the latest fails to load. */
  backup: `${STORAGE_PREFIX}save:backup`,
  /** The state and the log buffer at a crash. */
  crash: `${STORAGE_PREFIX}save:crash`,
} as const;

export interface SaveFile {
  schemaVersion: number;
  /** The `package.json` version that wrote it. */
  gameVersion: string;
  /** Wall-clock time of the save, in ms since the epoch. */
  savedAt: number;
  seed: string;
  state: SerializedState;
  /** The log buffer, in a crash save or a crash export. */
  log?: LogEntry[];
}

/** A save of some older schema, as parsed JSON. */
export type RawSave = { schemaVersion: number } & Record<string, unknown>;

/** Turns a save of schema `v` into one of schema `v + 1`. */
export type Migration = (save: RawSave) => RawSave;

/** `MIGRATIONS[v]` upgrades a save of schema `v`. */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {
  // Schema 2: a Station holds a buffer (FR92). Its card also shrank from
  // 3×3 to 2×2, which keeps its top-left cell.
  1: (save) => {
    const state = save.state as { nodes?: unknown } | undefined;
    if (!Array.isArray(state?.nodes)) return { ...save, schemaVersion: 2 };
    const nodes = (state.nodes as [number, { kind: string }][]).map(
      ([id, node]) =>
        node.kind === "station" ? [id, { ...node, items: [] }] : [id, node],
    );
    return { ...save, schemaVersion: 2, state: { ...state, nodes } };
  },
  // Schema 3: the rail layer (Epic 5), with no rails yet.
  2: (save) => {
    const state = save.state as { nextIds?: object } | undefined;
    if (typeof state !== "object" || state === null) {
      return { ...save, schemaVersion: 3 };
    }
    return {
      ...save,
      schemaVersion: 3,
      state: { ...state, rails: [], nextIds: { ...state.nextIds, rail: 1 } },
    };
  },
};

/** Applies the migrations one after another, up to `target`. */
export function migrate(
  save: RawSave,
  migrations: Readonly<Record<number, Migration>> = MIGRATIONS,
  target = SCHEMA_VERSION,
): Result<RawSave> {
  if (save.schemaVersion > target) return fail("newer_save");
  let current = save;
  while (current.schemaVersion < target) {
    const step = migrations[current.schemaVersion];
    if (!step) return fail("bad_save");
    const next = step(current);
    if (next.schemaVersion !== current.schemaVersion + 1) {
      throw new Error(`migration ${current.schemaVersion} set a wrong version`);
    }
    current = next;
  }
  return ok(current);
}

/** The save of `state` at `savedAt`, as JSON text. */
export function encodeSave(
  state: GameState,
  savedAt: number,
  logEntries?: LogEntry[],
): string {
  const save: SaveFile = {
    schemaVersion: SCHEMA_VERSION,
    gameVersion: GAME_VERSION,
    savedAt,
    seed: state.map.seed,
    // Stringified at once, so it can share the live state's data.
    state: toPairs(state),
  };
  if (logEntries) save.log = logEntries;
  return JSON.stringify(save);
}

/** Parses a save's JSON text and migrates it to the current schema. */
export function decodeSave(
  text: string,
  migrations?: Readonly<Record<number, Migration>>,
): Result<SaveFile> {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    log.warn("save", "save is not JSON", String(error));
    return fail("bad_save");
  }
  if (!isRawSave(data)) return fail("bad_save");
  const migrated = migrate(data, migrations);
  if (!migrated.ok) return migrated;
  const save = migrated.value;
  if (!isSaveFile(save)) return fail("bad_save");
  try {
    // Building it once proves loadState will not throw on it later.
    deserializeState(save.state);
  } catch (error) {
    log.warn("save", "save state does not rebuild", String(error));
    return fail("bad_save");
  }
  return ok(save);
}

export function loadState(save: SaveFile): GameState {
  return deserializeState(save.state);
}

function isRawSave(data: unknown): data is RawSave {
  return (
    typeof data === "object" &&
    data !== null &&
    Number.isInteger((data as RawSave).schemaVersion) &&
    (data as RawSave).schemaVersion >= 1
  );
}

// A shallow check of what the state is built from; the rest is trusted.
function isSaveFile(save: RawSave): save is RawSave & SaveFile {
  const state = save.state as Partial<SerializedState> | undefined;
  return (
    typeof save.seed === "string" &&
    typeof state === "object" &&
    state !== null &&
    Number.isInteger(state.tick) &&
    Array.isArray(state.nodes) &&
    Array.isArray(state.edges) &&
    Array.isArray(state.rails) &&
    Array.isArray(state.map?.terrain)
  );
}

/** A save as export text: its JSON, gzipped, in base64 (FR128). */
export async function exportText(json: string): Promise<string> {
  const stream = new Blob([json])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let binary = "";
  // In chunks: spreading the whole array overflows the argument limit.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** Reads pasted export text, or a save's plain JSON. */
export async function importText(text: string): Promise<Result<SaveFile>> {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return decodeSave(trimmed);
  let json: string;
  try {
    const bytes = Uint8Array.from(atob(trimmed.replace(/\s/g, "")), (ch) =>
      ch.charCodeAt(0),
    );
    const stream = new Blob([bytes])
      .stream()
      .pipeThrough(new DecompressionStream("gzip"));
    json = await new Response(stream).text();
  } catch (error) {
    log.warn("save", "import is not a gzipped save", String(error));
    return fail("bad_save");
  }
  return decodeSave(json);
}

/** The part of a key-value store the save uses, so tests can stand in for IndexedDB. */
export interface KeyValueStore {
  get(key: string): Promise<unknown>;
  /** Writes every entry in one transaction. */
  setMany(entries: [string, unknown][]): Promise<void>;
}

/** The game's own IndexedDB database, the one the settings use too. */
export function idbStore(): KeyValueStore {
  const store = createStore(`${STORAGE_PREFIX}db`, "keyval");
  return {
    get: (key) => get(key, store),
    setMany: (entries) => setMany(entries, store),
  };
}

/** What boot found in the save slots. */
export type BootSave =
  | { kind: "none" }
  | { kind: "loaded"; save: SaveFile }
  /** The latest save failed to load; the backup, if it loads, is offered. */
  | { kind: "failed"; reason: FailReason; backup: SaveFile | null };

/**
 * The save slots: the latest save and its backup. Each write moves the
 * previous good save into the backup slot, in the same transaction.
 */
export class SaveSlots {
  /**
   * The text of the last good save written or loaded, which the next write
   * rotates into the backup slot. `null` until there is one, so a save that
   * failed to load never overwrites the backup.
   */
  private previous: string | null = null;
  /**
   * The hash of the state in the latest slot. A save of the same state is
   * skipped: hiding the tab fires two events, and a hidden tab does not tick,
   * and rewriting would rotate a copy of the latest over the real backup.
   */
  private savedHash: string | null = null;

  constructor(
    private readonly store: KeyValueStore,
    private readonly now: () => number = Date.now,
  ) {}

  async load(): Promise<BootSave> {
    const text = await this.store.get(SAVE_KEYS.auto);
    if (text === undefined) return { kind: "none" };
    const save = typeof text === "string" ? decodeSave(text) : fail("bad_save");
    if (save.ok) {
      this.previous = text as string;
      this.savedHash = hashState(loadState(save.value));
      return { kind: "loaded", save: save.value };
    }
    log.error("save", "latest save failed to load", save.reason);
    if (save.reason === "newer_save") {
      // An older build must not erase a newer game: the next write moves it
      // into the backup slot for the newer build to find.
      this.previous = text as string;
      return { kind: "failed", reason: save.reason, backup: null };
    }
    const backupText = await this.store.get(SAVE_KEYS.backup);
    const backup =
      typeof backupText === "string" ? decodeSave(backupText) : null;
    if (!backup?.ok)
      return { kind: "failed", reason: save.reason, backup: null };
    // Keeps the backup where it is, whether or not the player takes it.
    this.previous = backupText as string;
    return { kind: "failed", reason: save.reason, backup: backup.value };
  }

  async save(state: GameState): Promise<void> {
    const hash = hashState(state);
    if (hash === this.savedHash) return;
    this.savedHash = hash;
    const text = encodeSave(state, this.now());
    const entries: [string, unknown][] = [[SAVE_KEYS.auto, text]];
    if (this.previous !== null) entries.push([SAVE_KEYS.backup, this.previous]);
    // Set first, so a save started before this one resolves rotates this one.
    this.previous = text;
    try {
      await this.store.setMany(entries);
    } catch (error) {
      // Nothing was written, so the same state must be saved again.
      this.savedHash = null;
      throw error;
    }
  }

  /** Writes `save:crash`, apart from the slots, with the log buffer. */
  async saveCrash(state: GameState, logEntries: LogEntry[]): Promise<void> {
    await this.store.setMany([
      [SAVE_KEYS.crash, encodeSave(state, this.now(), logEntries)],
    ]);
  }
}

/**
 * Saves every `AUTOSAVE_MS` and whenever the page is hidden or unloaded
 * (FR126). Returns a function that stops it.
 */
export function startAutosave(save: () => Promise<void>): () => void {
  const run = () => {
    save().catch((error: unknown) =>
      log.error("save", "autosave failed", String(error)),
    );
  };
  const onVisibility = () => {
    if (document.visibilityState === "hidden") run();
  };
  const timer = window.setInterval(run, AUTOSAVE_MS);
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", run);
  return () => {
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", run);
  };
}
