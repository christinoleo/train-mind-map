import { describe, expect, it } from "vitest";
import { STORAGE_CAPACITY } from "../../../src/data/nodes";
import {
  FINAL_RESEARCH,
  RESEARCH,
  type ResearchId,
} from "../../../src/data/research";
import { CommandQueue } from "../../../src/sim/commands/commandQueue";
import { PlaceNode } from "../../../src/sim/commands/placeNode";
import { SetResearch } from "../../../src/sim/commands/setResearch";
import type { SimEvent } from "../../../src/sim/events";
import { fail, ok } from "../../../src/sim/result";
import {
  createGameState,
  type GameState,
  type LabNode,
} from "../../../src/sim/state/gameState";
import { allocateId, type NodeId } from "../../../src/sim/state/ids";
import { createNode, isUnlocked } from "../../../src/sim/state/nodes";
import { acceptItem } from "../../../src/sim/state/production";
import { creditPack, researchStatus } from "../../../src/sim/state/research";
import { tapYield } from "../../../src/sim/state/stamina";
import { storageCapacity } from "../../../src/sim/state/stock";
import { flow } from "../../../src/sim/systems/flow";
import { LAB_TICKS } from "../../../src/sim/systems/research";
import { SYSTEMS, tick } from "../../../src/sim/tick";
import { link } from "../support/power";

/** The systems without edge flow: the tests feed the Labs themselves. */
const NO_FLOW = SYSTEMS.filter((system) => system !== flow);

/** A game with Labs placed directly, powered by the Core, and a tick driver. */
function setup(labs = 1, powered = true) {
  const state = createGameState("research");
  const commands = new CommandQueue();
  const events: SimEvent[] = [];
  const nodes: LabNode[] = [];
  for (let i = 0; i < labs; i++) {
    const id = allocateId(state.nextIds, "node");
    const lab = createNode(id, "lab", 3 * i, 0) as LabNode;
    state.nodes.set(id, lab);
    if (powered) link(state, id, 1 as NodeId);
    nodes.push(lab);
  }
  /** Runs `n` ticks, topping each Lab up with red science first. */
  const run = (n: number, feed = true) => {
    for (let t = 0; t < n; t++) {
      if (feed) for (const lab of nodes) acceptItem(lab, "red-science");
      tick(state, commands, (e) => events.push(e), NO_FLOW);
    }
  };
  const choose = (id: ResearchId | null) => {
    commands.dispatch(state, new SetResearch(id));
  };
  const done = () =>
    events.flatMap((e) => (e.type === "ResearchDone" ? [e.research] : []));
  return { state, labs: nodes, run, choose, events, done };
}

/** Completes `id` at once, as the Labs would with its last pack. */
function finish(state: GameState, id: ResearchId, events: SimEvent[] = []) {
  state.research.active = id;
  state.research.progress[id] = RESEARCH[id].cost - 1;
  creditPack(state, (e) => events.push(e));
}

describe("Lab", () => {
  it("takes up to 2 science packs and nothing else", () => {
    const { labs } = setup();
    const [lab] = labs;
    expect(acceptItem(lab, "iron-plate")).toBe(false);
    expect(acceptItem(lab, "red-science")).toBe(true);
    expect(acceptItem(lab, "red-science")).toBe(true);
    expect(acceptItem(lab, "red-science")).toBe(false);
  });

  it("consumes 1 pack every 5 s for the active research", () => {
    const { state, run, choose } = setup();
    choose("edge-2");
    run(1);
    run(LAB_TICKS * 3);
    expect(state.research.progress["edge-2"]).toBe(3);
  });

  it("idles, keeping its packs, while no research is chosen", () => {
    const { state, labs, run } = setup();
    run(200);
    expect(labs[0].production.input["red-science"]).toBe(2);
    expect(labs[0].production.status).toBe("starved");
    expect(state.research.progress).toEqual({});
  });

  it("works only while its mesh has power", () => {
    const { state, labs, run, choose } = setup(1, false);
    choose("edge-2");
    run(200);
    expect(labs[0].production.status).toBe("no_power");
    expect(state.research.progress["edge-2"] ?? 0).toBe(0);
  });

  it("never spends more packs than the research still needs", () => {
    const { state, labs, run, choose } = setup(3);
    state.research.progress["tools-1"] = RESEARCH["tools-1"].cost - 1;
    choose("tools-1");
    run(1);
    const spent = labs.filter((lab) => lab.production.progress !== null);
    expect(spent).toHaveLength(1);
  });

  it("completes a research, unlocks it at once and emits ResearchDone", () => {
    const { state, run, choose, done } = setup();
    choose("tools-1");
    run(1 + LAB_TICKS * RESEARCH["tools-1"].cost);
    expect(done()).toEqual(["tools-1"]);
    expect(state.research.done).toEqual(["tools-1"]);
    expect(state.research.active).toBeNull();
    expect(tapYield(state)).toBe(2);
    // With nothing chosen, the Labs hold what they have.
    run(LAB_TICKS * 4);
    expect(done()).toEqual(["tools-1"]);
  });

  it("keeps a research's packs when the player switches away and back", () => {
    const { state, run, choose } = setup();
    choose("edge-2");
    run(1 + LAB_TICKS * 2);
    choose("railway");
    run(1 + LAB_TICKS);
    choose("edge-2");
    run(1 + LAB_TICKS);
    expect(state.research.progress["edge-2"]).toBe(3);
    expect(state.research.progress.railway).toBe(1);
  });
});

describe("SetResearch", () => {
  it("chooses an open research, and refuses a locked or a done one", () => {
    const { state } = setup();
    expect(new SetResearch("tools-1").validate(state)).toEqual(ok());
    expect(new SetResearch("tools-2").validate(state)).toEqual(fail("locked"));
    expect(new SetResearch(FINAL_RESEARCH).validate(state)).toEqual(
      fail("locked"),
    );
    finish(state, "tools-1");
    expect(new SetResearch("tools-2").validate(state)).toEqual(ok());
    expect(new SetResearch("tools-1").validate(state)).toEqual(
      fail("researched"),
    );
    expect(new SetResearch(null).validate(state)).toEqual(ok());
  });
});

describe("unlocks", () => {
  it("start with the six starting nodes only", () => {
    const { state } = setup();
    expect([...state.unlockedNodes].sort()).toEqual(
      ["assembler-1", "box", "extractor", "furnace", "generator", "lab"].sort(),
    );
  });

  it("gate the Splitter and Merger behind Divisor e Mesclador", () => {
    const { state } = setup();
    const place = new PlaceNode("splitter", 45, 45);
    expect(place.validate(state)).toEqual(fail("locked"));
    finish(state, "splitter-merger");
    expect(isUnlocked(state, "splitter")).toBe(true);
    expect(isUnlocked(state, "merger")).toBe(true);
    expect(place.validate(state)).not.toEqual(fail("locked"));
  });

  it("raise the tap to 2 and then 4 items with Ferramentas", () => {
    const { state } = setup();
    expect(tapYield(state)).toBe(1);
    finish(state, "tools-1");
    expect(tapYield(state)).toBe(2);
    finish(state, "tools-2");
    expect(tapYield(state)).toBe(4);
  });

  it("raise the edge level with Aresta 2", () => {
    const { state } = setup();
    expect(state.edgeLevel).toBe(1);
    finish(state, "edge-2");
    expect(state.edgeLevel).toBe(2);
  });

  it("raise what a Box holds with Caixas extras", () => {
    const { state } = setup();
    const box = createNode(99 as NodeId, "box", 0, 0);
    if (box.kind !== "box") throw new Error("not a Box");
    expect(storageCapacity(state, box)).toBe(STORAGE_CAPACITY.box);
    finish(state, "extra-boxes");
    expect(storageCapacity(state, box)).toBe(1000);
  });

  it("open the Station and then Protótipo final with Ferrovia", () => {
    const { state } = setup();
    expect(isUnlocked(state, "station")).toBe(false);
    finish(state, "railway");
    expect(isUnlocked(state, "station")).toBe(true);
    expect(researchStatus(state, FINAL_RESEARCH)).toBe("available");
  });

  it("end the content with Protótipo final, which unlocks nothing", () => {
    const { state } = setup();
    finish(state, "railway");
    const unlocked = [...state.unlockedNodes];
    const events: SimEvent[] = [];
    finish(state, FINAL_RESEARCH, events);
    expect(events).toEqual([
      { type: "ResearchDone", research: FINAL_RESEARCH },
    ]);
    expect(state.unlockedNodes).toEqual(unlocked);
  });
});
