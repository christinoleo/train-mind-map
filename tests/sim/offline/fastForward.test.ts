import { describe, expect, it } from "vitest";
import { OFFLINE_CAP_MS, TICK_MS } from "../../../src/config/constants";
import type { ItemId } from "../../../src/data/items";
import type { NodeKind } from "../../../src/data/nodes";
import { MVP_SCENARIO } from "../../../src/data/scenarios/mvp";
import { CommandQueue } from "../../../src/sim/commands/commandQueue";
import {
  fastForward,
  type OfflineBudget,
} from "../../../src/sim/offline/fastForward";
import { WINDOW_TICKS } from "../../../src/sim/offline/steadyState";
import {
  createGameState,
  type Edge,
  type FactoryNode,
  type LabNode,
} from "../../../src/sim/state/gameState";
import { allocateId } from "../../../src/sim/state/ids";
import { createNode } from "../../../src/sim/state/nodes";
import { acceptItem } from "../../../src/sim/state/production";
import { serializeState } from "../../../src/sim/state/serialize";
import { coreNode, store, storedCount } from "../../../src/sim/state/stock";
import { tick } from "../../../src/sim/tick";

const HOUR_MS = 60 * 60 * 1000;

/** A budget that never runs out, so the result depends on the state alone. */
const UNLIMITED: OfflineBudget = { ms: Infinity, now: () => 0 };

/**
 * `extractors` iron Extractors, each feeding its own Furnace, whose plates
 * go to the Core. The edges carry power from the Core, so it runs as long
 * as its 3 ⚡ last. Nodes sit anywhere; each edge is a straight run.
 */
function factory(extractors = 1) {
  const state = createGameState(MVP_SCENARIO);
  const put = <K extends NodeKind>(kind: K) => {
    const id = allocateId(state.nextIds, "node");
    const node = createNode(id, kind, 0, 0, { resource: "iron-ore" });
    state.nodes.set(id, node);
    return node as FactoryNode & { kind: K };
  };
  const wire = (from: FactoryNode, to: FactoryNode, cells = 6) => {
    const id = allocateId(state.nextIds, "edge");
    const edge: Edge = {
      id,
      from: from.id,
      fromPort: 0,
      to: to.id,
      toPort: 0,
      level: 1,
      path: [
        { x: 0, y: 0 },
        { x: cells - 1, y: 0 },
      ],
      items: [],
    };
    state.edges.set(id, edge);
  };
  const core = coreNode(state);
  const nodes: FactoryNode[] = [];
  for (let i = 0; i < extractors; i++) {
    const extractor = put("extractor");
    const furnace = put("furnace");
    wire(extractor, furnace);
    wire(furnace, core);
    nodes.push(extractor, furnace);
  }
  return { state, core, nodes, put, wire };
}

/** Runs `ms` of live ticks. */
function live(state: ReturnType<typeof factory>["state"], ms: number) {
  const commands = new CommandQueue();
  for (let t = 0; t < ms / TICK_MS; t++) tick(state, commands, () => {});
}

function stored(state: ReturnType<typeof factory>["state"], item: ItemId) {
  return state.stock[item] ?? 0;
}

describe("fastForward", () => {
  it("matches the live simulation on a fixed seed", () => {
    const a = factory();
    const b = factory();
    live(a.state, HOUR_MS);
    const report = fastForward(b.state, HOUR_MS, UNLIMITED);
    const plates = stored(a.state, "iron-plate");
    // A Furnace makes a plate every 3.2 s: about 1125 in the hour.
    expect(plates).toBeGreaterThan(1000);
    expect(Math.abs(stored(b.state, "iron-plate") - plates)).toBeLessThan(
      plates * 0.02,
    );
    expect(report.produced["iron-plate"]).toBe(stored(b.state, "iron-plate"));
    expect(b.state.tick).toBe(a.state.tick);
  });

  it("runs a partly covered, mixed Extractor at its live rates", () => {
    const setup = () => {
      const { state, put, wire, core } = factory(0);
      const extractor = put("extractor");
      extractor.coverage = [
        { resource: "iron-ore", cells: 2 },
        { resource: "coal", cells: 1 },
      ];
      wire(extractor, core);
      return state;
    };
    const a = setup();
    const b = setup();
    live(a, HOUR_MS);
    fastForward(b, HOUR_MS, UNLIMITED);
    // 0.25 iron/s and 0.125 coal/s: 900 and 450 in the hour. Offline
    // measures the same rates over two 60 s windows, give or take the item
    // that falls on a window's edge: 1 in 30.
    for (const [item, expected] of [
      ["iron-ore", 900],
      ["coal", 450],
    ] as const) {
      expect(Math.abs(stored(a, item) - expected)).toBeLessThanOrEqual(2);
      expect(Math.abs(stored(b, item) - stored(a, item))).toBeLessThan(
        expected * 0.04,
      );
    }
  });

  it("extrapolates once the rates settle, well before the end", () => {
    const { state } = factory();
    let ticks = 0;
    // A clock that counts its reads, one per 64 ticks, never running out.
    const budget = { ms: Infinity, now: () => ticks++ };
    fastForward(state, HOUR_MS, budget);
    expect(ticks * 64).toBeLessThanOrEqual(4 * WINDOW_TICKS);
  });

  it("names the node stuck the longest as the bottleneck", () => {
    const { state, nodes } = factory();
    // The Extractor makes ore faster than the Furnace smelts it.
    const report = fastForward(state, HOUR_MS, UNLIMITED);
    expect(report.bottleneck).toEqual({ node: nodes[0].id, status: "blocked" });
  });

  it("does not cap at the Core, however long the absence", () => {
    const { state, core } = factory(4);
    store(core, "stone", 1_000_000);
    const report = fastForward(state, OFFLINE_CAP_MS, UNLIMITED);
    const plates = report.produced["iron-plate"] ?? 0;
    // Far past the 2,000 items the Core once held.
    expect(plates).toBeGreaterThan(5000);
    expect(storedCount(core)).toBe(1_000_000 + plates);
  });

  it(`covers at most ${OFFLINE_CAP_MS / HOUR_MS} h of absence`, () => {
    const { state } = factory();
    const before = state.tick;
    const report = fastForward(state, 24 * HOUR_MS, UNLIMITED);
    expect(report.elapsedMs).toBe(OFFLINE_CAP_MS);
    expect(state.tick - before).toBe(OFFLINE_CAP_MS / TICK_MS);
  });

  it("computes 24 h in 1 s or less, even when the budget runs out", () => {
    // The Core's 3 ⚡ spread over 60 chains make them crawl: the first
    // plates arrive late, and the fast-forward runs into its budget.
    const { state } = factory(60);
    const budget = { ms: 400, now: () => performance.now() };
    const start = performance.now();
    const report = fastForward(state, 24 * HOUR_MS, budget);
    expect(report.produced["iron-plate"]).toBeGreaterThan(0);
    expect(performance.now() - start).toBeLessThan(1000);
  });

  it("falls back to the measured rates when the budget runs out", () => {
    const a = factory();
    const b = factory();
    live(a.state, HOUR_MS);
    let reads = 0;
    // Runs out after three windows' worth of ticks: 64 ticks per read.
    const budget = { ms: (3 * WINDOW_TICKS) / 64, now: () => reads++ };
    fastForward(b.state, HOUR_MS, budget);
    const plates = stored(a.state, "iron-plate");
    expect(Math.abs(stored(b.state, "iron-plate") - plates)).toBeLessThan(
      plates * 0.05,
    );
  });

  it("is deterministic", () => {
    const a = factory(2);
    const b = factory(2);
    fastForward(a.state, 3 * HOUR_MS, UNLIMITED);
    fastForward(b.state, 3 * HOUR_MS, UNLIMITED);
    expect(serializeState(a.state)).toEqual(serializeState(b.state));
  });

  it("leaves the research where it was: Labs do not consume offline", () => {
    const { state, core, put, wire } = factory();
    const lab = put("lab") as LabNode;
    wire(lab, core);
    state.research.active = "splitter-merger";
    acceptItem(lab, "red-science");
    acceptItem(lab, "red-science");
    const before = structuredClone(state.research);
    const report = fastForward(state, HOUR_MS, UNLIMITED);
    expect(state.research).toEqual(before);
    expect(lab.production.input["red-science"]).toBe(2);
    expect(lab.production.status).toBe("starved");
    expect(report.bottleneck?.node).not.toBe(lab.id);
  });

  it("does nothing for no time away", () => {
    const { state } = factory();
    const before = serializeState(state);
    const report = fastForward(state, -5, UNLIMITED);
    expect(report).toEqual({ elapsedMs: 0, produced: {}, bottleneck: null });
    expect(serializeState(state)).toEqual(before);
  });
});

describe("the live simulation after fastForward", () => {
  it("picks up where offline left off", () => {
    const { state } = factory();
    fastForward(state, HOUR_MS, UNLIMITED);
    const before = stored(state, "iron-plate");
    live(state, 60_000);
    expect(stored(state, "iron-plate")).toBeGreaterThan(before);
  });
});
