import { createStore, get, set, type UseStore } from "idb-keyval";
import { STORAGE_PREFIX } from "../config/constants";
import { log } from "./log";

/** The player's preferences, kept apart from the save (AR14). */
export interface Settings {
  /** How many onboarding hints the player has seen through, in order (FR139). */
  hintsSeen: number;
}

const DEFAULT_SETTINGS: Readonly<Settings> = { hintsSeen: 0 };

const SETTINGS_KEY = `${STORAGE_PREFIX}settings`;

// idb-keyval's default database is shared by every game on the itch.io
// origin, so the game opens its own.
let store: UseStore | undefined;
function gameStore(): UseStore {
  return (store ??= createStore(STORAGE_PREFIX + "db", "keyval"));
}

/**
 * The stored settings over the defaults. Storage can be missing or blocked
 * (private mode, an iOS iframe), and then the defaults stand.
 */
export async function loadSettings(): Promise<Settings> {
  try {
    const stored = await get<Partial<Settings>>(SETTINGS_KEY, gameStore());
    return { ...DEFAULT_SETTINGS, ...stored };
  } catch (error) {
    log.warn("save", "settings not loaded", String(error));
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(
  settings: Readonly<Settings>,
): Promise<void> {
  try {
    await set(SETTINGS_KEY, settings, gameStore());
  } catch (error) {
    log.warn("save", "settings not saved", String(error));
  }
}
