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
import { PlaceNode } from "../../src/sim/commands/placeNode";
import { EventQueue } from "../../src/sim/events";
import { createGameState, type GameState } from "../../src/sim/state/gameState";
import type { NodeId } from "../../src/sim/state/ids";
import { hashState } from "../../src/sim/state/serialize";
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

describe("migrations", () => {
  it("loads the committed schema 1 fixture", () => {
    const save = decodeSave(JSON.stringify(fixture));
    if (!save.ok) throw new Error(save.reason);
    const state = loadState(save.value);
    expect(state.map.seed).toBe(fixture.seed);
    expect(state.tick).toBe(fixture.state.tick);
    expect(state.nodes.size).toBe(fixture.state.nodes.length);
    expect(state.edges.size).toBe(fixture.state.edges.length);
  });

  it("gives a schema 1 Station an empty buffer", () => {
    const v1 = structuredClone(fixture) as unknown as RawSave & {
      state: { nodes: [number, object][] };
    };
    v1.state.nodes.push([99, { id: 99, kind: "station", x: 0, y: 0 }]);
    const migrated = migrate(v1);
    if (!migrated.ok) throw new Error(migrated.reason);
    const { nodes } = migrated.value.state as typeof v1.state;
    expect(nodes.at(-1)).toEqual([
      99,
      { id: 99, kind: "station", x: 0, y: 0, items: [] },
    ]);
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
