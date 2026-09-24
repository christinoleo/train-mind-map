// The replay (FR159): the world a game started on and every command and undo
// applied, with its tick, as text. Loaded into a fresh game of the same
// world, it plays the game again, at whatever speed the superadmin sets.

import { MVP_SCENARIO } from "../data/scenarios/mvp";
import type { Scenario } from "../data/scenarios/scenario";
import type { Command } from "../sim/commands/command";
import type { ReplayEntry } from "../sim/commands/commandQueue";
import { ConnectEdge } from "../sim/commands/connectEdge";
import { ManualTap } from "../sim/commands/manualTap";
import { MoveNode } from "../sim/commands/moveNode";
import { PlaceNode } from "../sim/commands/placeNode";
import { RemoveEdge } from "../sim/commands/removeEdge";
import { RemoveNode } from "../sim/commands/removeNode";
import { SetRecipe } from "../sim/commands/setRecipe";
import { UpgradeEdge } from "../sim/commands/upgradeEdge";
import { UpgradeNode } from "../sim/commands/upgradeNode";
import { fail, ok, type Result } from "../sim/result";
import { createGameState } from "../sim/state/gameState";
import { GiveItems, SetRevealedRing } from "./cheats";

/** Bumped whenever a command's arguments change meaning. */
export const REPLAY_VERSION = 1;
const FORMAT = "train-mind-map-replay";

/** The scenarios a replay can name, by id. */
const SCENARIOS: Readonly<Record<string, Scenario>> = { mvp: MVP_SCENARIO };

/** How a command type turns into JSON arguments and back. */
interface Codec {
  args(command: Command): unknown[];
  make(args: unknown[]): Command;
}

function codec<A extends unknown[], C extends Command>(
  Make: new (...args: A) => C,
  args: (command: C) => [...A],
): Codec {
  return {
    args: (command) => args(command as C),
    make: (values) => new Make(...(values as A)),
  };
}

/**
 * Every command a player or the superadmin dispatches. Inverses are not
 * here: the log records an undo as such.
 */
const CODECS: Readonly<Record<string, Codec>> = {
  PlaceNode: codec(PlaceNode, (c) => [c.kind, c.x, c.y, c.recipe]),
  RemoveNode: codec(RemoveNode, (c) => [c.id]),
  MoveNode: codec(MoveNode, (c) => [c.id, c.x, c.y]),
  UpgradeNode: codec(UpgradeNode, (c) => [c.id]),
  SetRecipe: codec(SetRecipe, (c) => [c.id, c.recipe]),
  ConnectEdge: codec(ConnectEdge, (c) => [c.from, c.to]),
  RemoveEdge: codec(RemoveEdge, (c) => [c.id]),
  UpgradeEdge: codec(UpgradeEdge, (c) => [c.id, c.level]),
  ManualTap: codec(ManualTap, (c) => [c.x, c.y]),
  SetRevealedRing: codec(SetRevealedRing, (c) => [c.ring]),
  GiveItems: codec(GiveItems, (c) => [c.perItem]),
};

const UNDO = "Undo";

/** A decoded replay: the world to start and the log to schedule on it. */
export interface Replay {
  world: string | Scenario;
  /** The tick the replay was exported at. */
  tick: number;
  log: ReplayEntry[];
}

/** The replay of a game started on `world`, up to `tick`, as JSON text. */
export function encodeReplay(
  world: string | Scenario,
  tick: number,
  log: readonly ReplayEntry[],
): string {
  const scenario = Object.keys(SCENARIOS).find((id) => SCENARIOS[id] === world);
  if (typeof world !== "string" && !scenario) {
    throw new Error("Only a seed or a named scenario can be replayed");
  }
  const entries = log.map(([at, entry]) => {
    if (entry === "undo") return [at, UNDO];
    const codec = CODECS[entry.type];
    if (!codec) throw new Error(`${entry.type} cannot be replayed`);
    return [at, entry.type, ...codec.args(entry)];
  });
  return JSON.stringify({
    format: FORMAT,
    version: REPLAY_VERSION,
    world: typeof world === "string" ? { seed: world } : { scenario },
    tick,
    log: entries,
  });
}

/** Reads a replay back from `encodeReplay`'s text. */
export function decodeReplay(text: string): Result<Replay> {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return fail("bad_replay");
  }
  if (!isRecord(data) || data.format !== FORMAT) return fail("bad_replay");
  if (data.version !== REPLAY_VERSION) return fail("bad_replay");
  const world = worldOf(data.world);
  if (world === null || typeof data.tick !== "number") {
    return fail("bad_replay");
  }
  if (!Array.isArray(data.log)) return fail("bad_replay");
  // Each command is validated once against the world's start, so arguments
  // of the wrong shape fail here and not inside the tick loop.
  const probe = createGameState(world);
  const log: ReplayEntry[] = [];
  for (const entry of data.log as unknown[]) {
    if (!Array.isArray(entry)) return fail("bad_replay");
    const [at, type, ...args] = entry as unknown[];
    if (typeof at !== "number" || typeof type !== "string") {
      return fail("bad_replay");
    }
    if (type === UNDO) {
      log.push([at, "undo"]);
      continue;
    }
    const codec = CODECS[type];
    if (!codec) return fail("bad_replay");
    const command = codec.make(args);
    try {
      command.validate(probe);
    } catch {
      return fail("bad_replay");
    }
    log.push([at, command]);
  }
  return ok({ world, tick: data.tick, log });
}

function worldOf(world: unknown): string | Scenario | null {
  if (!isRecord(world)) return null;
  if (typeof world.seed === "string") return world.seed;
  if (typeof world.scenario === "string") {
    return SCENARIOS[world.scenario] ?? null;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
