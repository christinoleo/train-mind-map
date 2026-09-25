import { describe, expect, it } from "vitest";
import { MVP_SCENARIO } from "../../src/data/scenarios/mvp";
import { GiveItems } from "../../src/debug/cheats";
import {
  decodeSave,
  encodeSave,
  exportText,
  importText,
  loadState,
  migrate,
  SAVE_KEYS,
  SaveSlots,
  SCHEMA_VERSION,
  type KeyValueStore,
  type Migration,
  type RawSave,
} from "../../src/platform/save";
import { CommandQueue } from "../../src/sim/commands/commandQueue";
import { ConnectEdge } from "../../src/sim/commands/connectEdge";
import type { Command } from "../../src/sim/commands/command";
import { CreateLine } from "../../src/sim/commands/createLine";
import { PlaceNode } from "../../src/sim/commands/placeNode";
import { PlaceRail } from "../../src/sim/commands/placeRail";
import { EventQueue } from "../../src/sim/events";
import {
  createGameState,
  type FactoryNode,
  type GameState,
} from "../../src/sim/state/gameState";
import {
  deserializeState,
  hashState,
  serializeState,
  type SerializedState,
} from "../../src/sim/state/serialize";
import { addCounts } from "../../src/data/items";
import { NODES } from "../../src/data/nodes";
import { edgeCost } from "../../src/sim/state/edges";
import type { EdgeId, NodeId } from "../../src/sim/state/ids";
import { createNode } from "../../src/sim/state/nodes";
import { sumStock } from "../../src/sim/state/stock";
import { tick } from "../../src/sim/tick";
import fixture from "./fixtures/save-v1.json";

/** An in-memory stand-in for IndexedDB. */
function memoryStore(): KeyValueStore & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  return {
    data,
    get: async (key) => data.get(key),
    setMany: async (entries) => {
      for (const [key, value] of entries) data.set(key, value);
    },
  };
}

/** A running factory: an Extractor on the stone left of the Core, feeding it. */
function factory() {
  const state = createGameState(MVP_SCENARIO);
  const commands = new CommandQueue();
  const events = new EventQueue();
  const step = () => {
    tick(state, commands, events.emit);
    events.drain();
  };
  const deposit = stoneDeposit(state);
  commands.dispatch(state, new GiveItems(100));
  step();
  expectOk(
    commands.dispatch(state, new PlaceNode("extractor", deposit.x, deposit.y)),
  );
  step();
  const [core, extractor] = [1 as NodeId, 2 as NodeId];
  expectOk(
    commands.dispatch(
      state,
      new ConnectEdge({ node: extractor, port: 0 }, { node: core, port: 0 }),
    ),
  );
  step();
  return { state, commands, step };
}

function stoneDeposit(state: GameState) {
  const deposit = state.map.deposits.find((d) => d.resource === "stone");
  if (!deposit) throw new Error("no stone deposit");
  return deposit;
}

function expectOk(result: { ok: boolean }) {
  expect(result).toMatchObject({ ok: true });
}

function reload(text: string): GameState {
  const save = decodeSave(text);
  if (!save.ok) throw new Error(save.reason);
  return loadState(save.value);
}

describe("save format", () => {
  it("round-trips the state through its JSON text", () => {
    const { state, step } = factory();
    for (let i = 0; i < 50; i++) step();
    const text = encodeSave(state, 1234);
    const save = JSON.parse(text);
    expect(save).toMatchObject({
      schemaVersion: SCHEMA_VERSION,
      savedAt: 1234,
      seed: state.map.seed,
    });
    expect(typeof save.gameVersion).toBe("string");
    // Maps are arrays of pairs; the derived caches stay out.
    expect(Array.isArray(save.state.nodes)).toBe(true);
    expect(save.state.stock).toBeUndefined();
    const restored = reload(text);
    expect(restored.nodes).toBeInstanceOf(Map);
    expect(hashState(restored)).toBe(hashState(state));
    expect(restored.stock).toEqual(state.stock);
  });

  it("loses nothing over 50 save and reload cycles", async () => {
    const live = factory();
    const store = memoryStore();
    let state = factory().state;
    const idle = new CommandQueue();
    for (let cycle = 0; cycle < 50; cycle++) {
      for (let i = 0; i < 7; i++) {
        live.step();
        tick(state, idle, () => {});
      }
      await new SaveSlots(store, () => cycle).save(state);
      const booted = await new SaveSlots(store).load();
      if (booted.kind !== "loaded") throw new Error(booted.kind);
      state = loadState(booted.save);
      expect(hashState(state)).toBe(hashState(live.state));
    }
    // The factory ran the whole time: ore reached the Core.
    expect(live.state.tick).toBeGreaterThan(350);
    expect(live.state.stock.stone).toBeGreaterThan(100);
  });

  it("rejects text that is not a save", () => {
    expect(decodeSave("not json")).toEqual({ ok: false, reason: "bad_save" });
    expect(decodeSave("{}")).toEqual({ ok: false, reason: "bad_save" });
    expect(
      decodeSave(JSON.stringify({ schemaVersion: 1, seed: "x", state: {} })),
    ).toEqual({ ok: false, reason: "bad_save" });
  });

  it("rejects a save whose state does not rebuild", () => {
    const save = JSON.parse(encodeSave(createGameState("pairs"), 0));
    save.state.nodes = [1, 2];
    expect(decodeSave(JSON.stringify(save))).toEqual({
      ok: false,
      reason: "bad_save",
    });
  });

  it("refuses a save from a newer schema", () => {
    const text = encodeSave(createGameState("new"), 0);
    const newer = { ...JSON.parse(text), schemaVersion: SCHEMA_VERSION + 1 };
    expect(decodeSave(JSON.stringify(newer))).toEqual({
      ok: false,
      reason: "newer_save",
    });
  });
});

/** `state` saved as schema 7, migrated to the latest and loaded back. */
function migrateFrom7(state: GameState): GameState {
  const v7: RawSave = {
    schemaVersion: 7,
    state: JSON.parse(JSON.stringify(serializeState(state))),
  };
  const migrated = migrate(v7);
  if (!migrated.ok) throw new Error(migrated.reason);
  return deserializeState(migrated.value.state as SerializedState);
}

describe("migrations", () => {
  it("loads the committed schema 1 fixture", () => {
    const save = decodeSave(JSON.stringify(fixture));
    if (!save.ok) throw new Error(save.reason);
    const state = loadState(save.value);
    expect(state.map.seed).toBe(fixture.seed);
    expect(state.tick).toBe(fixture.state.tick);
    expect(state.nodes.size).toBe(fixture.state.nodes.length);
    // Schema 8 grew the Core to 4×4, which took its one edge off.
    expect(state.edges.size).toBe(0);
    expect(state.map.core).toEqual({ x: 59, y: 59, w: 4, h: 4 });
    // Schema 3 brought the rail layer, empty in an older save.
    expect(state.rails.size).toBe(0);
    expect(state.nextIds.rail).toBe(1);
    // Schema 4 brought trains, none in an older save.
    expect(state.trains.size).toBe(0);
    expect(state.reservations.size).toBe(0);
    expect(state.nextIds.train).toBe(1);
    // Schema 5 brought Lines, none in an older save.
    expect(state.lines.size).toBe(0);
    expect(state.nextIds.line).toBe(1);
  });

  it("drops the Core's capacity from a schema 5 save", () => {
    const v5: RawSave = {
      schemaVersion: 5,
      state: { tick: 3, storageCapacity: { core: 2000, box: 1000 } },
    };
    const migrated = migrate(v5);
    if (!migrated.ok) throw new Error(migrated.reason);
    expect(migrated.value.state).toEqual({
      tick: 3,
      storageCapacity: { box: 1000 },
    });
  });

  it("starts each schema 6 train unblocked", () => {
    const v6: RawSave = {
      schemaVersion: 6,
      state: { trains: [[1, { id: 1, idle: 4 }]] },
    };
    const migrated = migrate(v6);
    if (!migrated.ok) throw new Error(migrated.reason);
    expect(migrated.value.state).toEqual({
      trains: [[1, { id: 1, idle: 4, blocked: 0 }]],
    });
  });

  it("gives each schema 4 train a Line of its own", () => {
    const v4: RawSave = {
      schemaVersion: 4,
      state: {
        nextIds: { train: 2 },
        trains: [
          [1, { id: 1, stops: [3, 4], stop: 1, wagons: 2, dwell: 7, pos: 5 }],
        ],
      },
    };
    const migrated = migrate(v4);
    if (!migrated.ok) throw new Error(migrated.reason);
    expect(migrated.value.state).toEqual({
      nextIds: { train: 2, line: 2 },
      lines: [
        [
          1,
          {
            id: 1,
            stops: [
              { station: 3, condition: { kind: "inactive", seconds: 5 } },
              { station: 4, condition: { kind: "inactive", seconds: 5 } },
            ],
          },
        ],
      ],
      trains: [
        [
          1,
          {
            id: 1,
            line: 1,
            stop: 1,
            pos: 5,
            wagons: [
              { item: null, count: 0 },
              { item: null, count: 0 },
            ],
            waited: 0,
            idle: 0,
            blocked: 0,
            lapStart: null,
            lap: null,
          },
        ],
      ],
    });
  });

  it("gives a schema 1 Station an empty buffer", () => {
    const v1 = structuredClone(fixture) as unknown as RawSave & {
      state: { nodes: [number, object][] };
    };
    v1.state.nodes.push([99, { id: 99, kind: "station", x: 46, y: 46 }]);
    const migrated = migrate(v1);
    if (!migrated.ok) throw new Error(migrated.reason);
    const { nodes } = migrated.value.state as typeof v1.state;
    expect(nodes.at(-1)).toEqual([
      99,
      { id: 99, kind: "station", x: 46, y: 46, items: [] },
    ]);
  });

  it("grows schema 7 footprints, refunding the edges that no longer fit", () => {
    const state = createGameState(MVP_SCENARIO);
    const put = (node: FactoryNode) => state.nodes.set(node.id, node);
    // A 2×2 Splitter at (50, 50), fed by a Box on its left, and a Box
    // right under it that the grown Splitter would cover.
    put(createNode(2 as NodeId, "box", 46, 50));
    put(createNode(3 as NodeId, "splitter", 50, 50));
    put(createNode(4 as NodeId, "box", 50, 52));
    state.edges.set(1 as EdgeId, {
      id: 1 as EdgeId,
      from: 2 as NodeId,
      fromPort: 0,
      to: 3 as NodeId,
      toPort: 0,
      level: 1,
      path: [
        { x: 48, y: 50 },
        { x: 49, y: 50 },
      ],
      items: [],
    });
    state.nextIds.node = 5;
    state.nextIds.edge = 2;
    const after = migrateFrom7(state);
    // The Splitter shifted up a cell, clear of the Box below.
    expect(after.nodes.get(3 as NodeId)).toMatchObject({ x: 50, y: 49 });
    expect(after.edges.size).toBe(0);
    expect(after.stock).toEqual(
      addCounts(sumStock(state.nodes), edgeCost(2, 1)),
    );
  });

  it("removes a grown schema 7 node that no shift fits, refunded", () => {
    const state = createGameState(MVP_SCENARIO);
    const put = (node: FactoryNode) => state.nodes.set(node.id, node);
    // A 2×2 Splitter at (50, 50) boxed in: Boxes right and below block its
    // own cells grown, and one up-left blocks the shifts.
    put(createNode(2 as NodeId, "splitter", 50, 50));
    put(createNode(3 as NodeId, "box", 52, 50));
    put(createNode(4 as NodeId, "box", 50, 52));
    put(createNode(5 as NodeId, "box", 48, 48));
    state.nextIds.node = 6;
    const after = migrateFrom7(state);
    expect(after.nodes.has(2 as NodeId)).toBe(false);
    expect([...after.nodes.keys()]).toEqual([1, 3, 4, 5]);
    expect(after.stock).toEqual(
      addCounts(sumStock(state.nodes), NODES.splitter.cost),
    );
  });

  it("takes a grown schema 7 Station's rails and Lines off, refunded", () => {
    const { state, commands, step } = factory();
    state.unlockedNodes.push("station");
    const run = (command: Command) => {
      expectOk(commands.dispatch(state, command));
      step();
    };
    run(new GiveItems(1000));
    run(new PlaceNode("station", 46, 46));
    run(new PlaceNode("station", 56, 46));
    const [a, b] = [...state.nodes.values()]
      .filter((n) => n.kind === "station")
      .map((n) => n.id);
    run(new PlaceRail({ node: a, port: 1 }, { node: b, port: 0 }));
    run(new CreateLine([a, b]));
    expect(state.trains.size).toBe(1);
    const before = sumStock(state.nodes);
    const after = migrateFrom7(state);
    expect(after.rails.size).toBe(0);
    expect(after.lines.size).toBe(0);
    expect(after.trains.size).toBe(0);
    expect(after.stock.rail).toBeGreaterThan(before.rail ?? 0);
    expect(after.stock.circuit).toBeGreaterThan(before.circuit ?? 0);
  });

  it("applies the chain one version at a time", () => {
    const chain: Record<number, Migration> = {
      1: (save) => ({ ...save, schemaVersion: 2, renamed: save.old }),
      2: (save) => {
        const { old, ...rest } = save;
        void old;
        return { ...rest, schemaVersion: 3 };
      },
    };
    const v1: RawSave = { schemaVersion: 1, old: "value" };
    expect(migrate(v1, chain, 3)).toEqual({
      ok: true,
      value: { schemaVersion: 3, renamed: "value" },
    });
    expect(migrate({ schemaVersion: 3 }, chain, 3)).toEqual({
      ok: true,
      value: { schemaVersion: 3 },
    });
  });

  it("fails on a gap in the chain", () => {
    expect(migrate({ schemaVersion: 1 }, {}, 2)).toEqual({
      ok: false,
      reason: "bad_save",
    });
  });
});

describe("save slots", () => {
  it("starts with nothing to load", async () => {
    expect(await new SaveSlots(memoryStore()).load()).toEqual({ kind: "none" });
  });

  it("rotates the previous save into the backup", async () => {
    const store = memoryStore();
    const slots = new SaveSlots(store, () => 0);
    const state = createGameState("rotate");
    await slots.save(state);
    const first = store.data.get(SAVE_KEYS.auto);
    expect(store.data.has(SAVE_KEYS.backup)).toBe(false);
    state.tick = 10;
    await slots.save(state);
    expect(store.data.get(SAVE_KEYS.backup)).toBe(first);

    const booted = await new SaveSlots(store).load();
    expect(booted.kind).toBe("loaded");
    if (booted.kind === "loaded") expect(booted.save.state.tick).toBe(10);
  });

  it("skips a save of an unchanged state, keeping the backup", async () => {
    const store = memoryStore();
    const slots = new SaveSlots(store);
    const state = createGameState("twice");
    await slots.save(state);
    const first = store.data.get(SAVE_KEYS.auto);
    state.tick = 1;
    await slots.save(state);
    const second = store.data.get(SAVE_KEYS.auto);
    // Hiding the tab fires visibilitychange and pagehide back to back.
    await slots.save(state);
    expect(store.data.get(SAVE_KEYS.auto)).toBe(second);
    expect(store.data.get(SAVE_KEYS.backup)).toBe(first);
  });

  it("offers the backup when the latest save fails to load", async () => {
    const store = memoryStore();
    const state = createGameState("backup");
    const good = encodeSave(state, 0);
    store.data.set(SAVE_KEYS.auto, "{broken");
    store.data.set(SAVE_KEYS.backup, good);

    const slots = new SaveSlots(store);
    const booted = await slots.load();
    expect(booted).toMatchObject({ kind: "failed", reason: "bad_save" });
    if (booted.kind !== "failed") return;
    expect(booted.backup?.state.tick).toBe(0);

    // Whatever the player picks, the next save keeps the backup.
    state.tick = 5;
    await slots.save(state);
    expect(store.data.get(SAVE_KEYS.backup)).toBe(good);
  });

  it("keeps a save from a newer build for that build", async () => {
    const store = memoryStore();
    const text = encodeSave(createGameState("newer"), 0);
    const newer = JSON.stringify({
      ...JSON.parse(text),
      schemaVersion: SCHEMA_VERSION + 1,
    });
    store.data.set(SAVE_KEYS.auto, newer);
    const slots = new SaveSlots(store);
    expect(await slots.load()).toMatchObject({
      kind: "failed",
      reason: "newer_save",
    });
    await slots.save(createGameState("older"));
    expect(store.data.get(SAVE_KEYS.backup)).toBe(newer);
  });

  it("never rotates a broken save into the backup", async () => {
    const store = memoryStore();
    store.data.set(SAVE_KEYS.auto, "{broken");
    const slots = new SaveSlots(store);
    expect(await slots.load()).toMatchObject({ kind: "failed", backup: null });
    await slots.save(createGameState("fresh"));
    expect(store.data.has(SAVE_KEYS.backup)).toBe(false);
  });

  it("restores the backup as the latest save and keeps it", async () => {
    const store = memoryStore();
    const good = encodeSave(createGameState("good"), 0);
    store.data.set(SAVE_KEYS.auto, encodeSave(createGameState("bad"), 1));
    store.data.set(SAVE_KEYS.backup, good);
    const slots = new SaveSlots(store);
    await slots.load();

    const restored = await slots.restoreBackup();
    expect(restored).toMatchObject({ ok: true, value: { seed: "good" } });
    expect(store.data.get(SAVE_KEYS.auto)).toBe(good);
    expect(store.data.get(SAVE_KEYS.backup)).toBe(good);
    // The next save rotates the backup, not the game it replaced.
    const state = createGameState("good");
    state.tick = 3;
    await slots.save(state);
    expect(store.data.get(SAVE_KEYS.backup)).toBe(good);
  });

  it("says when there is no backup to restore", async () => {
    const store = memoryStore();
    const slots = new SaveSlots(store);
    expect(await slots.restoreBackup()).toEqual({
      ok: false,
      reason: "no_backup",
    });
    store.data.set(SAVE_KEYS.backup, "{broken");
    expect(await slots.restoreBackup()).toEqual({
      ok: false,
      reason: "bad_save",
    });
    expect(store.data.has(SAVE_KEYS.auto)).toBe(false);
  });

  it("starts a new game over a running one and keeps the settings", async () => {
    const store = memoryStore();
    const settingsKey = "train-mind-map:settings";
    store.data.set(settingsKey, { hintsSeen: 3 });
    const { state } = factory();
    const slots = new SaveSlots(store);
    await slots.save(state);
    const played = store.data.get(SAVE_KEYS.auto);

    await slots.save(createGameState(MVP_SCENARIO));
    const booted = await new SaveSlots(store).load();
    if (booted.kind !== "loaded") throw new Error(booted.kind);
    expect(hashState(loadState(booted.save))).toBe(
      hashState(createGameState(MVP_SCENARIO)),
    );
    expect(store.data.get(SAVE_KEYS.backup)).toBe(played);
    expect(store.data.get(settingsKey)).toEqual({ hintsSeen: 3 });
  });

  it("starts over after a crash without losing the backup", async () => {
    const store = memoryStore();
    const good = encodeSave(createGameState("good"), 0);
    const crashing = encodeSave(createGameState("crashing"), 1);
    store.data.set(SAVE_KEYS.auto, crashing);
    store.data.set(SAVE_KEYS.backup, good);
    const slots = new SaveSlots(store);
    await slots.load();

    await slots.startOver(createGameState(MVP_SCENARIO));
    expect(store.data.get(SAVE_KEYS.backup)).toBe(good);
    const booted = await new SaveSlots(store).load();
    expect(booted).toMatchObject({
      kind: "loaded",
      save: { seed: MVP_SCENARIO.seed },
    });
  });

  it("writes the crash save with the log", async () => {
    const store = memoryStore();
    const entry = {
      time: 0,
      level: "error",
      module: "ui",
      msg: "boom",
    } as const;
    await new SaveSlots(store).saveCrash(createGameState("crash"), [entry]);
    const crash = JSON.parse(store.data.get(SAVE_KEYS.crash) as string);
    expect(crash.log).toEqual([entry]);
    expect(store.data.has(SAVE_KEYS.auto)).toBe(false);
  });
});

describe("export and import", () => {
  it("round-trips through gzipped base64", async () => {
    const { state, step } = factory();
    for (let i = 0; i < 20; i++) step();
    const json = encodeSave(state, 0);
    const text = await exportText(json);
    expect(text).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(text.length).toBeLessThan(json.length / 4);
    const imported = await importText(`  ${text}\n`);
    if (!imported.ok) throw new Error(imported.reason);
    expect(hashState(loadState(imported.value))).toBe(hashState(state));
  });

  it("accepts a save's plain JSON", async () => {
    const state = createGameState("plain");
    const imported = await importText(encodeSave(state, 0));
    expect(imported.ok).toBe(true);
  });

  it("rejects pasted text that is not a save", async () => {
    expect(await importText("hello")).toEqual({
      ok: false,
      reason: "bad_save",
    });
    expect(await importText(btoa("not gzip"))).toEqual({
      ok: false,
      reason: "bad_save",
    });
  });
});
