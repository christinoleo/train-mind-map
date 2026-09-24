import { describe, expect, it } from "vitest";
import type { ItemId } from "../../../src/data/items";
import type { DepartureCondition } from "../../../src/data/rail";
import { MVP_SCENARIO } from "../../../src/data/scenarios/mvp";
import type { Command } from "../../../src/sim/commands/command";
import { CommandQueue } from "../../../src/sim/commands/commandQueue";
import { ConnectEdge } from "../../../src/sim/commands/connectEdge";
import { CreateLine } from "../../../src/sim/commands/createLine";
import { PlaceNode } from "../../../src/sim/commands/placeNode";
import { PlaceRail } from "../../../src/sim/commands/placeRail";
import { PlaceTrain } from "../../../src/sim/commands/placeTrain";
import { RemoveLine } from "../../../src/sim/commands/removeLine";
import { RemoveNode } from "../../../src/sim/commands/removeNode";
import { SetDeparture } from "../../../src/sim/commands/setDeparture";
import { EventQueue, type SimEvent } from "../../../src/sim/events";
import {
  effectiveThroughput,
  lineThroughput,
  mayDepart,
  stationRole,
  travelSeconds,
} from "../../../src/sim/rail/lines";
import { fail, ok, type Result } from "../../../src/sim/result";
import {
  createGameState,
  type StationNode,
  type Wagon,
} from "../../../src/sim/state/gameState";
import type { NodeId } from "../../../src/sim/state/ids";
import {
  store,
  storedItems,
  type StorageNode,
} from "../../../src/sim/state/stock";
import { updateStock } from "../../../src/sim/systems/stock";
import { tick } from "../../../src/sim/tick";

const LEFT = 0;
const RIGHT = 1;

/** A game on the MVP map with Stations unlocked and `items` in the Core. */
function game(items: Partial<Record<ItemId, number>>) {
  const state = createGameState(MVP_SCENARIO);
  state.unlockedNodes.push("station");
  const core = state.nodes.get(1 as NodeId) as StorageNode;
  for (const [item, count] of Object.entries(items)) {
    store(core, item as ItemId, count);
  }
  updateStock(state);
  const commands = new CommandQueue();
  const events = new EventQueue();
  const seen: SimEvent[] = [];
  events.on("LineCreated", (e) => seen.push(e));
  events.on("TrainStateChanged", (e) => seen.push(e));
  const step = () => {
    tick(state, commands, events.emit);
    events.drain();
  };
  const run = (command: Command): Result => {
    const result = commands.dispatch(state, command);
    step();
    return result;
  };
  const undo = (): Result => {
    const result = commands.undo(state);
    step();
    return result;
  };
  /** Places a node, and returns its id. */
  const place = (...args: ConstructorParameters<typeof PlaceNode>): NodeId => {
    expect(run(new PlaceNode(...args))).toEqual(ok());
    return Math.max(...state.nodes.keys()) as NodeId;
  };
  const connect = (from: NodeId, to: NodeId, toPort = 0) => {
    expect(
      run(new ConnectEdge({ node: from, port: 0 }, { node: to, port: toPort })),
    ).toEqual(ok());
  };
  return { state, core, run, undo, step, place, connect, seen };
}

const BUILD = {
  "iron-plate": 300,
  brick: 50,
  rail: 300,
  gear: 150,
  circuit: 30,
  "iron-ore": 200,
  stone: 100,
} as const;

/**
 * Two Stations in the base joined by a rail: `a` loads from a Box on its
 * left, `b` unloads into a Box on its right.
 */
function yard() {
  const g = game(BUILD);
  const supply = g.place("box", 42, 45);
  const a = g.place("station", 46, 45);
  const b = g.place("station", 60, 45);
  const sink = g.place("box", 64, 45);
  g.connect(supply, a);
  g.connect(b, sink);
  expect(
    g.run(new PlaceRail({ node: a, port: RIGHT }, { node: b, port: LEFT })),
  ).toEqual(ok());
  expect(g.run(new CreateLine([a, b]))).toEqual(ok());
  const line = [...g.state.lines.values()].at(-1)!;
  const train = [...g.state.trains.values()].at(-1)!;
  const station = (id: NodeId) => g.state.nodes.get(id) as StationNode;
  const box = (id: NodeId) => g.state.nodes.get(id) as StorageNode;
  return { ...g, supply, a, b, sink, line, train, station, box };
}

const wagon = (item: ItemId | null, count: number): Wagon => ({ item, count });

describe("departure conditions (FR96)", () => {
  const at = (wagons: Wagon[], waited = 0, idle = 0) => ({
    wagons,
    waited,
    idle,
  });
  const full = [wagon("copper-ore", 50), wagon("iron-ore", 50)];
  const part = [wagon("copper-ore", 50), wagon(null, 0)];
  const empty = [wagon(null, 0), wagon(null, 0)];
  const when = (kind: DepartureCondition["kind"], seconds = 0) => ({
    kind,
    seconds,
  });

  it("cheio waits for every wagon to be full", () => {
    expect(mayDepart(at(full), when("full"))).toBe(true);
    expect(mayDepart(at(part, 1e6), when("full"))).toBe(false);
  });

  it("vazio waits for every wagon to be empty", () => {
    expect(mayDepart(at(empty), when("empty"))).toBe(true);
    expect(mayDepart(at(part, 1e6), when("empty"))).toBe(false);
  });

  it("esperar X s counts the time at the stop", () => {
    expect(mayDepart(at(part, 49), when("wait", 5))).toBe(false);
    expect(mayDepart(at(part, 50), when("wait", 5))).toBe(true);
  });

  it("cheio OU X s leaves on whichever comes first", () => {
    expect(mayDepart(at(full, 0), when("full_or_wait", 5))).toBe(true);
    expect(mayDepart(at(part, 49), when("full_or_wait", 5))).toBe(false);
    expect(mayDepart(at(part, 50), when("full_or_wait", 5))).toBe(true);
  });

  it("inativo por X s counts the time since the last item moved", () => {
    expect(mayDepart(at(part, 1e6, 49), when("inactive", 5))).toBe(false);
    expect(mayDepart(at(part, 0, 50), when("inactive", 5))).toBe(true);
  });

  it("keeps a train at the stop until its condition holds", () => {
    const { run, step, line, train, a } = yard();
    expect(
      run(new SetDeparture(line.id, 0, { kind: "wait", seconds: 10 })),
    ).toEqual(ok());
    for (let i = 0; i < 200 && train.waited < 99; i++) step();
    expect(train.station).toBe(a);
    step();
    step();
    expect(train.station).toBeNull();
  });

  it("is set by SetDeparture, and undone", () => {
    const { state, run, undo, line } = yard();
    const before = structuredClone(line.stops[1].condition);
    const cheio = { kind: "full", seconds: 0 } as const;
    expect(run(new SetDeparture(line.id, 1, cheio))).toEqual(ok());
    expect(state.lines.get(line.id)!.stops[1].condition).toEqual(cheio);
    expect(undo()).toEqual(ok());
    expect(state.lines.get(line.id)!.stops[1].condition).toEqual(before);
    expect(run(new SetDeparture(line.id, 2, cheio))).toEqual(fail("not_found"));
  });
});

describe("loading and unloading (FR89, FR92, FR93)", () => {
  it("loads where edges enter and unloads where edges leave", () => {
    const { state, a, b } = yard();
    expect(stationRole(state, a)).toBe("load");
    expect(stationRole(state, b)).toBe("unload");
  });

  it("types each wagon by its first item, at 50 items/s per wagon", () => {
    const { step, train, station, a } = yard();
    const buffer = station(a);
    // Copper waited longest, so the first wagon takes copper; that runs
    // out, and the second takes the oldest item left, iron.
    store(buffer, "copper-ore", 5);
    store(buffer, "iron-ore", 80);
    step();
    expect(train.wagons).toEqual([
      wagon("copper-ore", 5),
      wagon("iron-ore", 5),
    ]);
    expect(train.state).toBe("loading");
    for (let i = 0; i < 20; i++) step();
    // The copper wagon takes no iron, though it has room.
    expect(train.wagons).toEqual([
      wagon("copper-ore", 5),
      wagon("iron-ore", 50),
    ]);
    expect(storedItems(buffer)).toEqual({ "iron-ore": 30 });
  });

  it("unloads, and frees each wagon once it is empty", () => {
    const { state, run, step, line, train, station, b, sink, box } = yard();
    run(new SetDeparture(line.id, 0, { kind: "full", seconds: 0 }));
    run(new SetDeparture(line.id, 1, { kind: "empty", seconds: 0 }));
    const buffer = station(line.stops[0].station);
    store(buffer, "copper-ore", 100);
    for (let i = 0; i < 1000 && train.station !== b; i++) step();
    expect(train.station).toBe(b);
    expect(train.wagons).toEqual([
      wagon("copper-ore", 50),
      wagon("copper-ore", 50),
    ]);
    step();
    expect(train.state).toBe("unloading");
    expect(train.wagons[0].count).toBe(45);
    for (let i = 0; i < 100 && train.station === b; i++) step();
    expect(train.station).toBeNull();
    expect(train.wagons).toEqual([wagon(null, 0), wagon(null, 0)]);
    // All of it goes on into the Box behind b, at the edge's 2 items/s.
    for (let i = 0; i < 700; i++) step();
    expect(storedItems(box(sink))).toEqual({ "copper-ore": 100 });
    expect(storedItems(station(b))).toEqual({});
    expect(state.trains.size).toBe(1);
  });
});

describe("effective throughput (FR97)", () => {
  it("is the load per trip over the round trip, times the trains", () => {
    expect(effectiveThroughput(100, 50, 1)).toBe(2);
    expect(effectiveThroughput(100, 50, 3)).toBe(6);
    expect(effectiveThroughput(100, 0, 1)).toBe(0);
  });

  it("times a trip by speeding up and braking at the train's rates", () => {
    // 0 → 8 cells/s over 12 cells, 8 → 0 over 4: 4 s for 16 cells.
    expect(travelSeconds(16)).toBeCloseTo(4, 9);
    expect(travelSeconds(32)).toBeCloseTo(6, 9);
    expect(travelSeconds(4)).toBeLessThan(travelSeconds(16));
  });

  it("estimates the round trip before a lap, then measures it", () => {
    const { state, run, step, line, train } = yard();
    for (const stop of [0, 1]) {
      run(new SetDeparture(line.id, stop, { kind: "wait", seconds: 3 }));
    }
    const estimate = lineThroughput(state, line);
    expect(estimate.measured).toBe(false);
    expect(estimate.perTrip).toBe(100);
    expect(estimate.trains).toBe(1);
    expect(estimate.roundTrip).toBeGreaterThan(6);
    for (let i = 0; i < 2000 && train.lap === null; i++) step();
    const measured = lineThroughput(state, line);
    expect(measured.measured).toBe(true);
    expect(measured.roundTrip).toBe(train.lap! / 10);
    expect(measured.perSecond).toBeCloseTo(100 / measured.roundTrip!, 9);
    // The estimate is the fastest the layout allows.
    expect(measured.roundTrip).toBeGreaterThanOrEqual(estimate.roundTrip!);
  });
});

describe("Line commands (FR95)", () => {
  it("announces a new Line, whose stops start with the default", () => {
    const { seen, line, a, b } = yard();
    expect(seen).toContainEqual({ type: "LineCreated", line: line.id });
    expect(line.stops.map((s) => s.station)).toEqual([a, b]);
    expect(line.stops[0].condition).toEqual({ kind: "inactive", seconds: 5 });
  });

  it("adds a train at a free stop, and refuses when none is free", () => {
    const { state, run, line, b } = yard();
    expect(run(new PlaceTrain(line.id))).toEqual(ok());
    const second = [...state.trains.values()].at(-1)!;
    expect(second.station).toBe(b);
    expect(lineThroughput(state, line).trains).toBe(2);
    expect(run(new PlaceTrain(line.id))).toEqual(fail("occupied"));
  });

  it("is removed with its trains, which frees its Stations, and undone", () => {
    const { state, run, undo, step, line, a } = yard();
    for (let i = 0; i < 30; i++) step();
    const before = { ...state.stock };
    expect(run(new RemoveNode(a))).toEqual(fail("has_trains"));
    expect(run(new RemoveLine(line.id))).toEqual(ok());
    expect(state.lines.size).toBe(0);
    expect(state.trains.size).toBe(0);
    expect(state.reservations.size).toBe(0);
    expect(undo()).toEqual(ok());
    expect(state.lines.size).toBe(1);
    expect(state.trains.size).toBe(1);
    expect(state.stock).toEqual(before);
  });
});

describe("the MVP copper line", () => {
  it("brings 0.85 copper ore/s or more from the big deposit", () => {
    const { run, step, place, connect, core } = game(BUILD);
    // Two Extractors on the big copper deposit, beyond the water wall,
    // feed a Station; its rail runs through the corridor to a Station
    // beside the Core, which unloads into it.
    const e1 = place("extractor", 103, 57);
    const e2 = place("extractor", 103, 59);
    const deposit = place("station", 106, 58);
    const base = place("station", 54, 64);
    connect(e1, deposit, 0);
    connect(e2, deposit, 1);
    connect(base, core.id);
    expect(
      run(
        new PlaceRail(
          { node: base, port: RIGHT },
          { node: deposit, port: LEFT },
        ),
      ),
    ).toEqual(ok());
    expect(run(new CreateLine([deposit, base]))).toEqual(ok());
    const copper = () => storedItems(core)["copper-ore"] ?? 0;
    // Five minutes to settle, then ten to measure.
    for (let i = 0; i < 3000; i++) step();
    const start = copper();
    for (let i = 0; i < 6000; i++) step();
    expect((copper() - start) / 600).toBeGreaterThanOrEqual(0.85);
  });
});
