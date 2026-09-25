import { describe, expect, it } from "vitest";
import { TICK_MS } from "../../../src/config/constants";
import { MVP_SCENARIO } from "../../../src/data/scenarios/mvp";
import { TRAIN_MOTION } from "../../../src/data/rail";
import type { Command } from "../../../src/sim/commands/command";
import { CommandQueue } from "../../../src/sim/commands/commandQueue";
import { MoveNode } from "../../../src/sim/commands/moveNode";
import { PlaceRail } from "../../../src/sim/commands/placeRail";
import { CreateLine } from "../../../src/sim/commands/createLine";
import { RemoveNode } from "../../../src/sim/commands/removeNode";
import { RemoveRail } from "../../../src/sim/commands/removeRail";
import { RemoveTrain } from "../../../src/sim/commands/removeTrain";
import { EventQueue, type SimEvent } from "../../../src/sim/events";
import {
  findRoute,
  platformKey,
  segmentKey,
} from "../../../src/sim/rail/segments";
import { lineOf } from "../../../src/sim/rail/lines";
import {
  createTrain,
  trainCost,
  trainLength,
} from "../../../src/sim/rail/trains";
import { fail, ok, type Result } from "../../../src/sim/result";
import {
  createGameState,
  type GameState,
  type Train,
} from "../../../src/sim/state/gameState";
import {
  allocateId,
  type NodeId,
  type RailId,
  type TrainId,
} from "../../../src/sim/state/ids";
import { createNode } from "../../../src/sim/state/nodes";
import {
  deserializeState,
  hashState,
  serializeState,
} from "../../../src/sim/state/serialize";
import { updateStock } from "../../../src/sim/systems/stock";
import { tick } from "../../../src/sim/tick";
import { store, type StorageNode } from "../../../src/sim/state/stock";
import { fillCore } from "../support/stock";

const DT = TICK_MS / 1000;
const LEFT = 0;
const RIGHT = 1;

// Four Stations in the MVP base area, at the corners of a square. Each rail
// runs from one's right rail port to the next one's left, so trains enter a
// Station on the left and leave it on the right, round the loop.
const CORNERS = [
  [46, 45],
  [68, 45],
  [68, 70],
  [46, 70],
] as const;

function setup() {
  const state = createGameState(MVP_SCENARIO);
  // The Core holds 2000 items: 150 of each fills it but for the refunds.
  fillCore(state, 150);
  const commands = new CommandQueue();
  const events = new EventQueue();
  const seen: SimEvent[] = [];
  events.on("TrainArrived", (e) => seen.push(e));
  events.on("TrainStateChanged", (e) => seen.push(e));
  events.on("TrainDeadlock", (e) => seen.push(e));
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
  const stations = CORNERS.map(([x, y]) => {
    const id = allocateId(state.nextIds, "node");
    state.nodes.set(id, createNode(id, "station", x, y));
    return id;
  });
  updateStock(state);
  /** Joins Station `a`'s right rail port to Station `b`'s left one. */
  const rail = (a: NodeId, b: NodeId): RailId => {
    expect(
      run(new PlaceRail({ node: a, port: RIGHT }, { node: b, port: LEFT })),
    ).toEqual(ok());
    return [...state.rails.keys()].at(-1)!;
  };
  /**
   * A Line over `stops` and its train, which stands 2 s at each stop: with
   * no edges at its Stations it has nothing to load.
   */
  const train = (stops: NodeId[]): Train => {
    expect(run(new CreateLine(stops))).toEqual(ok());
    const t = [...state.trains.values()].at(-1)!;
    for (const stop of state.lines.get(t.line)!.stops) {
      stop.condition = { kind: "wait", seconds: 2 };
    }
    return t;
  };
  return { state, commands, run, undo, step, stations, rail, train, seen };
}

/** The line a→b→c: two rails, three Stations. */
function line() {
  const s = setup();
  const [a, b, c] = s.stations;
  const ab = s.rail(a, b);
  const bc = s.rail(b, c);
  return { ...s, a, b, c, ab, bc };
}

/** The whole square: four rails round the four Stations. */
function loop() {
  const s = setup();
  const [a, b, c, d] = s.stations;
  s.rail(a, b);
  s.rail(b, c);
  s.rail(c, d);
  s.rail(d, a);
  return { ...s, a, b, c, d };
}

/**
 * What each train's body covers, as reservation keys: the Segments and
 * platforms between its tail and its front.
 */
function covered(state: GameState, train: Train): string[] {
  const { stops } = lineOf(state, train);
  if (train.station !== null || !train.trip) {
    return [platformKey(train.station ?? stops[train.stop].station)];
  }
  const { legs, exit } = train.trip;
  const tail = train.pos - trainLength(train);
  const front = train.pos;
  const overlaps = (from: number, to: number) => tail < to && front > from;
  const keys: string[] = [];
  const start = stops.at(train.stop - 1)!.station;
  if (tail < exit) keys.push(platformKey(start));
  legs.forEach((leg, i) => {
    const from = i === 0 ? exit : legs[i - 1].exit;
    if (overlaps(from, leg.enter)) keys.push(leg.segment);
    if (overlaps(leg.enter, leg.exit) || front === leg.stop) {
      keys.push(leg.platform);
    }
  });
  return keys;
}

/** Fails unless every train holds what it covers, and no two share any. */
function expectSafe(state: GameState) {
  const owner = new Map<string, TrainId>();
  for (const train of state.trains.values()) {
    for (const key of covered(state, train)) {
      expect(owner.get(key), `${key} shared`).toBeUndefined();
      owner.set(key, train.id);
      expect(state.reservations.get(key), `${key} unreserved`).toBe(train.id);
    }
  }
}

describe("Segments (FR85)", () => {
  it("makes two directed tracks of each rail", () => {
    const { state, ab } = line();
    const keys = [...state.rails.values()].flatMap((r) => [
      segmentKey(r.id, true),
      segmentKey(r.id, false),
    ]);
    expect(keys).toContain(segmentKey(ab, true));
    expect(new Set(keys).size).toBe(4);
  });

  it("routes straight through a Station on the way", () => {
    const { state, a, c, ab, bc } = line();
    const route = findRoute(state, a, c)!;
    expect(route.map((s) => s.key)).toEqual([
      segmentKey(ab, true),
      segmentKey(bc, true),
    ]);
    // And back, on the other tracks.
    expect(findRoute(state, c, a)!.map((s) => s.key)).toEqual([
      segmentKey(bc, false),
      segmentKey(ab, false),
    ]);
  });

  it("finds no route between Stations no rail joins", () => {
    const { state, stations } = setup();
    expect(findRoute(state, stations[0], stations[1])).toBeNull();
  });
});

describe("CreateLine (FR88, FR95)", () => {
  it("pays for a locomotive and two wagons", () => {
    const { state, run, a, c } = line();
    const before = { ...state.stock };
    expect(run(new CreateLine([a, c]))).toEqual(ok());
    const cost = trainCost(2);
    expect(cost).toEqual({ "iron-plate": 60, gear: 40, circuit: 10 });
    for (const [item, count] of Object.entries(cost)) {
      const key = item as keyof typeof before;
      expect(state.stock[key]).toBe(before[key]! - count);
    }
  });

  it("stands at its first stop, holding the platform", () => {
    const { state, train, a, c } = line();
    const t = train([a, c]);
    expect(t.station).toBe(a);
    expect(t.state).toBe("loading");
    expect(state.reservations.get(platformKey(a))).toBe(t.id);
  });

  it("puts its train at the next free stop when the first is taken", () => {
    const { train, a, b, c } = line();
    train([a, b]);
    expect(train([a, b, c]).station).toBe(b);
  });

  it("refuses taken platforms, a missing route and repeated stops", () => {
    const { run, train, a, b, c, stations } = line();
    train([a, c]);
    expect(run(new CreateLine([b, stations[3]]))).toEqual(fail("no_route"));
    expect(run(new CreateLine([b, b]))).toEqual(fail("same_node"));
    expect(run(new CreateLine([b]))).toEqual(fail("no_route"));
  });

  it("keeps a Station free among the Lines that share Stations", () => {
    const { state, run, train, a, b, c, d } = loop();
    store(state.nodes.get(1 as NodeId) as StorageNode, "iron-plate", 100);
    updateStock(state);
    train([a, c]);
    // a and c alone: a train back the other way would leave neither free.
    expect(run(new CreateLine([c, a]))).toEqual(fail("line_full"));
    // Through b and d too, two trains leave two Stations free.
    expect(train([c, a, b, d]).station).toBe(c);
    expect(run(new CreateLine([a, c]))).toEqual(fail("occupied"));
    expect(run(new CreateLine([b, d]))).toEqual(ok());
    expect(run(new CreateLine([d, b]))).toEqual(fail("line_full"));
  });

  it("is undone with a refund, freeing the platform", () => {
    const { state, run, undo, a, c } = line();
    const before = { ...state.stock };
    run(new CreateLine([a, c]));
    expect(undo()).toEqual(ok());
    expect(state.lines.size).toBe(0);
    expect(state.trains.size).toBe(0);
    expect(state.reservations.size).toBe(0);
    expect(state.stock).toEqual(before);
  });
});

describe("train movement (FR90, FR94)", () => {
  it("leaves after its dwell and arrives at the next stop", () => {
    const { state, step, train, seen, a, c } = line();
    const t = train([a, c]);
    for (let i = 0; i < 600 && t.station !== c; i++) step();
    expect(t.station).toBe(c);
    expect(t.state).toBe("loading");
    expect(seen).toContainEqual({
      type: "TrainArrived",
      train: t.id,
      station: c,
    });
    const states = seen
      .filter((e) => e.type === "TrainStateChanged")
      .map((e) => (e as { state: string }).state);
    expect(states).toEqual(["departing", "moving", "loading"]);
    // It keeps only the platform it stands on.
    expect(t.holds.map((h) => h.key)).toEqual([platformKey(c)]);
    expect([...state.reservations.keys()]).toEqual([platformKey(c)]);
  });

  it("reaches 8 cells/s in 3 s and never goes faster", () => {
    const { state, step, train, a, c } = line();
    const t = train([a, c]);
    while (t.state !== "departing") step();
    const speeds: number[] = [t.speed];
    for (let i = 0; i < 40; i++) {
      step();
      speeds.push(t.speed);
    }
    const ticks = speeds.findIndex((v) => v > TRAIN_MOTION.maxSpeed - 1e-9);
    expect(ticks * DT).toBeCloseTo(TRAIN_MOTION.accelSeconds, 5);
    expect(Math.max(...speeds)).toBe(TRAIN_MOTION.maxSpeed);
    expect(state.trains.size).toBe(1);
  });

  it("goes round its stops in order", () => {
    const { step, train, a, b, c, d } = loop();
    const t = train([a, c, d]);
    const visited: NodeId[] = [];
    for (let i = 0; i < 3000 && visited.length < 4; i++) {
      step();
      if (t.station !== null && t.station !== visited.at(-1)) {
        visited.push(t.station);
      }
    }
    // It passes b without stopping.
    expect(visited).toEqual([a, c, d, a]);
    expect(visited).not.toContain(b);
  });
});

describe("reservation (FR86, ADR-0005)", () => {
  /** t2 runs a→c→b; t1 stands at c, so t2 cannot reserve the leg into c. */
  function blocked() {
    const s = line();
    const t1 = s.train([s.c, s.a]);
    // With nothing to load it is never full, so it stays at c.
    s.state.lines.get(t1.line)!.stops[0].condition = {
      kind: "full",
      seconds: 0,
    };
    const t2 = s.train([s.a, s.c, s.b]);
    return { ...s, t1, t2 };
  }

  it("waits in its Station until it can reserve the whole trip", () => {
    const { state, step, t2, a } = blocked();
    for (let i = 0; i < 400; i++) step();
    expect(t2.state).toBe("waiting_reservation");
    expect(t2.station).toBe(a);
    expect(t2.speed).toBe(0);
    // It takes nothing of the way while it waits.
    expect(t2.holds.map((h) => h.key)).toEqual([platformKey(a)]);
    expect([...state.reservations.values()].sort()).toEqual([1, 2]);
  });

  it("starts braking at the braking point, at 8 cells/s² at most", () => {
    const { step, train, a, c } = line();
    const t = train([a, c]);
    while (t.state !== "departing") step();
    const trip = t.trip!;
    const stop = trip.legs[trip.legs.length - 1].stop;
    let braking: number | null = null;
    let top = 0;
    while (t.station === null) {
      const before = { pos: t.pos, speed: t.speed };
      step();
      top = Math.max(top, t.speed);
      const drop = before.speed - t.speed;
      if (drop > 0 && braking === null) braking = stop - before.pos;
      expect(drop).toBeLessThanOrEqual(TRAIN_MOTION.brake * DT + 1e-9);
    }
    expect(top).toBe(TRAIN_MOTION.maxSpeed);
    // From top speed, braking at 8 cells/s² takes v² / 2b = 4 cells; the
    // train decides a tick ahead.
    const { maxSpeed, brake } = TRAIN_MOTION;
    const reach = (maxSpeed * maxSpeed) / (2 * brake);
    expect(reach).toBe(4);
    expect(braking).toBeGreaterThan(reach - maxSpeed * DT);
    expect(braking).toBeLessThanOrEqual(reach + maxSpeed * DT);
    expect(t.pos).toBe(stop);
    expect(t.speed).toBe(0);
  });

  it("goes on once the leg ahead frees", () => {
    const { step, run, t1, t2, c } = blocked();
    for (let i = 0; i < 400; i++) step();
    expect(run(new RemoveTrain(t1.id))).toEqual(ok());
    for (let i = 0; i < 400 && t2.station !== c; i++) step();
    expect(t2.station).toBe(c);
  });

  it("never puts two trains in one Segment or platform", () => {
    const { state, step, train, seen, a, b, c, d } = loop();
    // Three trains after each other round the loop.
    train([a, b, c, d]);
    train([b, c, d, a]);
    store(state.nodes.get(1 as NodeId) as StorageNode, "iron-plate", 100);
    updateStock(state);
    train([c, d, a, b]);
    const arrivals = new Map<TrainId, number>();
    for (let i = 0; i < 5000; i++) {
      step();
      expectSafe(state);
      for (const t of state.trains.values()) {
        if (t.station !== null && t.waited === 1) {
          arrivals.set(t.id, (arrivals.get(t.id) ?? 0) + 1);
        }
      }
    }
    // They all keep going round, and wait for each other at the stops.
    expect([...arrivals.values()].every((n) => n > 5)).toBe(true);
    expect(seen).toContainEqual(
      expect.objectContaining({ state: "waiting_reservation" }),
    );
  });

  it("goes round a Station another train stands in", () => {
    const { state, step, train, a, b, c, d } = loop();
    // The short way from b to d is back through a, where t1 stands.
    const t1 = train([a, c]);
    const t2 = train([b, d, a]);
    for (let i = 0; i < 1000 && t2.station !== d; i++) step();
    expect(t2.station).toBe(d);
    for (let i = 0; i < 1000 && t1.station !== c; i++) step();
    expect(t1.station).toBe(c);
    expect(state.trains.size).toBe(2);
  });

  it("keeps a rail and a Station while trains use them", () => {
    const { state, step, run, train, a, b, c, ab } = line();
    const t = train([a, c]);
    while (t.station !== null) step();
    expect(run(new RemoveRail(ab))).toEqual(fail("has_trains"));
    // b is on the way, not a stop, but its rails carry the trip.
    expect(run(new RemoveNode(b))).toEqual(fail("has_trains"));
    expect(state.rails.size).toBe(2);
    // a is a stop.
    expect(run(new RemoveNode(a))).toEqual(fail("has_trains"));
    // Once the train stands at c, b and its rails can go.
    while (t.station !== c) step();
    expect(run(new RemoveNode(b))).toEqual(ok());
    // a has no rails left, but is still a stop.
    expect(run(new MoveNode(a, 40, 40))).toEqual(fail("has_trains"));
    expect(state.trains.size).toBe(1);
  });
});

describe("deadlock (FR87)", () => {
  /**
   * The repro of a save from before the shared-Station guard: Lines a↔b and
   * b↔a, a train standing at each end, each waiting for the other's platform.
   */
  function crossed() {
    const s = setup();
    const deadlocks = () => s.seen.filter((e) => e.type === "TrainDeadlock");
    const [a, b] = s.stations;
    s.rail(a, b);
    const t1 = s.train([a, b]);
    const line = allocateId(s.state.nextIds, "line");
    s.state.lines.set(line, {
      id: line,
      stops: [b, a].map((station) => ({
        station,
        condition: { kind: "wait", seconds: 2 },
      })),
    });
    const t2 = createTrain(
      s.state,
      allocateId(s.state.nextIds, "train"),
      line,
      0,
      2,
    );
    return { ...s, deadlocks, a, b, t1, t2 };
  }

  it("refuses the second of two Lines over the same two Stations", () => {
    const { run, a, b } = crossed();
    expect(run(new CreateLine([b, a]))).toEqual(fail("line_full"));
    expect(run(new CreateLine([a, b]))).toEqual(fail("line_full"));
  });

  it("waits 10 s, then the lowest train id gives up its platform", () => {
    const { state, step, deadlocks, a, b, t1, t2 } = crossed();
    for (let i = 0; i < 100; i++) step();
    expect([t1.state, t2.state]).toEqual([
      "waiting_reservation",
      "waiting_reservation",
    ]);
    expect(deadlocks()).toEqual([]);
    for (let i = 0; i < 30 && deadlocks().length === 0; i++) step();
    expect(deadlocks()).toEqual([
      { type: "TrainDeadlock", trains: [t1.id, t2.id], released: t1.id },
    ]);
    expect(state.reservations.get(platformKey(a))).toBeUndefined();
    expect(t1.holds).toEqual([]);
    for (let i = 0; i < 300 && t2.station !== a; i++) step();
    expect(t2.station).toBe(a);
    for (let i = 0; i < 300 && t1.station !== b; i++) step();
    expect(t1.station).toBe(b);
  });

  it("no longer stops two crossed Lines for good", () => {
    const { step, t1, t2 } = crossed();
    const arrivals = [0, 0];
    for (let i = 0; i < 3000; i++) {
      step();
      [t1, t2].forEach((t, j) => {
        if (t.station !== null && t.waited === 1) arrivals[j]++;
      });
    }
    expect(arrivals.every((n) => n > 5)).toBe(true);
  });
});

describe("determinism", () => {
  function race(ticks: number, save?: number) {
    const s = loop();
    s.train([s.a, s.c]);
    s.train([s.b, s.d, s.a]);
    for (let i = 0; i < ticks; i++) {
      if (i === save) {
        const loaded = deserializeState(serializeState(s.state));
        Object.assign(s.state, loaded);
      }
      s.step();
    }
    return hashState(s.state);
  }

  it("gives the same state for the same commands", () => {
    expect(race(1500)).toBe(race(1500));
  });

  it("carries on the same after a save and load", () => {
    expect(race(1500, 700)).toBe(race(1500));
  });
});
