import { describe, expect, it } from "vitest";
import { STORAGE_CAPACITY } from "../../../src/data/nodes";
import { MVP_SCENARIO } from "../../../src/data/scenarios/mvp";
import { STAMINA } from "../../../src/data/tap";
import { CommandQueue } from "../../../src/sim/commands/commandQueue";
import { ManualTap } from "../../../src/sim/commands/manualTap";
import { PlaceNode } from "../../../src/sim/commands/placeNode";
import { EventQueue, type SimEvent } from "../../../src/sim/events";
import { fail, ok } from "../../../src/sim/result";
import { createGameState } from "../../../src/sim/state/gameState";
import type { NodeId } from "../../../src/sim/state/ids";
import { STAMINA_RECHARGE_TICKS } from "../../../src/sim/state/stamina";
import { coreNode, storedItems } from "../../../src/sim/state/stock";
import { createNode } from "../../../src/sim/state/nodes";
import { tick } from "../../../src/sim/tick";
import { fillCore } from "../support/stock";

/** A cell of the MVP iron deposit, (65, 58) to (69, 62). */
const IRON = { x: 66, y: 60 };

function setup() {
  const state = createGameState(MVP_SCENARIO);
  const commands = new CommandQueue();
  const events = new EventQueue();
  const seen: SimEvent[] = [];
  events.on("ManualTapped", (e) => seen.push(e));
  events.on("CommandRejected", (e) => seen.push(e));
  const step = (ticks = 1) => {
    for (let i = 0; i < ticks; i++) {
      tick(state, commands, events.emit);
      events.drain();
    }
  };
  const tap = (x = IRON.x, y = IRON.y) => {
    const result = commands.dispatch(state, new ManualTap(x, y));
    step();
    return result;
  };
  return { state, commands, seen, step, tap };
}

describe("ManualTap", () => {
  it("sends 1 item of the deposit's resource to the Core", () => {
    const { state, seen, tap } = setup();
    expect(tap()).toEqual(ok());
    expect(storedItems(coreNode(state))).toEqual({ "iron-ore": 1 });
    expect(state.stock).toEqual({ "iron-ore": 1 });
    expect(seen).toEqual([
      {
        type: "ManualTapped",
        ...IRON,
        item: "iron-ore",
        count: 1,
        core: coreNode(state).id,
      },
    ]);
  });

  it("draws from iron, copper, coal and stone", () => {
    const { state, tap } = setup();
    for (const [x, y] of [
      [66, 60],
      [60, 50],
      [60, 67],
      [52, 60],
    ]) {
      expect(tap(x, y)).toEqual(ok());
    }
    expect(storedItems(coreNode(state))).toEqual({
      "iron-ore": 1,
      "copper-ore": 1,
      coal: 1,
      stone: 1,
    });
  });

  it("refuses crude oil", () => {
    const { state, tap } = setup();
    state.map.deposits.push({
      resource: "crude-oil",
      x: 45,
      y: 45,
      w: 3,
      h: 3,
    });
    expect(tap(46, 46)).toEqual(fail("not_tappable"));
    fillCore(state);
    state.nodes.set(9 as NodeId, createNode(9 as NodeId, "box", 45, 45));
    expect(tap(46, 46)).toEqual(fail("occupied"));
    expect(state.stamina.points).toBe(STAMINA.max);
  });

  it("refuses bare ground and a deposit under a node", () => {
    const { state, commands, step, tap } = setup();
    expect(tap(46, 46)).toEqual(fail("needs_deposit"));
    fillCore(state);
    commands.dispatch(state, new PlaceNode("extractor", 65, 58));
    step();
    expect(tap(65, 58)).toEqual(fail("occupied"));
    expect(tap(69, 62)).toEqual(ok());
  });

  it("refuses a tap once the Core is full", () => {
    const { state, tap } = setup();
    coreNode(state).items = [{ item: "stone", count: STORAGE_CAPACITY.core }];
    expect(tap()).toEqual(fail("storage_full"));
    expect(state.stamina.points).toBe(STAMINA.max);
  });

  it("yields more at a higher tap level", () => {
    const { state, tap } = setup();
    state.tapLevel = 2;
    tap();
    expect(storedItems(coreNode(state))).toEqual({ "iron-ore": 4 });
    expect(state.stamina.points).toBe(STAMINA.max - 1);
  });

  it("is not undoable, and leaves the undo stack alone", () => {
    const { state, commands, step, tap } = setup();
    fillCore(state);
    commands.dispatch(state, new PlaceNode("box", 45, 45));
    step();
    for (let i = 0; i < 5; i++) tap();
    expect(commands.undoDepth).toBe(1);
    commands.undo(state);
    step();
    expect(state.nodes.size).toBe(1);
    expect(state.stamina.points).toBe(STAMINA.max - 5);
  });
});

describe("stamina", () => {
  it("starts full: 20 points, 1 back every 3 s", () => {
    const { state } = setup();
    expect(state.stamina.points).toBe(20);
    expect(STAMINA_RECHARGE_TICKS).toBe(30);
  });

  it("drains 1 point per tap and refuses a tap with none left", () => {
    const { state, seen, tap } = setup();
    for (let i = 0; i < STAMINA.max; i++) expect(tap()).toEqual(ok());
    expect(state.stamina.points).toBe(0);
    expect(tap()).toEqual(fail("no_stamina"));
    expect(storedItems(coreNode(state))).toEqual({ "iron-ore": STAMINA.max });
    expect(seen.filter((e) => e.type === "ManualTapped")).toHaveLength(20);
  });

  it("rejects a tap queued in the same tick as the last point's", () => {
    const { state, commands, seen, step } = setup();
    state.stamina.points = 1;
    expect(commands.dispatch(state, new ManualTap(IRON.x, IRON.y))).toEqual(
      ok(),
    );
    expect(commands.dispatch(state, new ManualTap(IRON.x, IRON.y))).toEqual(
      ok(),
    );
    step();
    expect(storedItems(coreNode(state))).toEqual({ "iron-ore": 1 });
    expect(seen.at(-1)).toEqual({
      type: "CommandRejected",
      command: "ManualTap",
      reason: "no_stamina",
    });
  });

  it("recharges 1 point every 30 ticks, up to the maximum", () => {
    const { state, step, tap } = setup();
    // The tap's own tick counts towards the first recharge.
    tap();
    tap();
    expect(state.stamina.points).toBe(18);
    step(STAMINA_RECHARGE_TICKS - 3);
    expect(state.stamina.points).toBe(18);
    step(1);
    expect(state.stamina.points).toBe(19);
    step(STAMINA_RECHARGE_TICKS);
    expect(state.stamina.points).toBe(20);
    step(STAMINA_RECHARGE_TICKS * 3);
    expect(state.stamina.points).toBe(20);
  });

  it("recovers a tap after an empty bar recharges", () => {
    const { state, step, tap } = setup();
    state.stamina.points = 0;
    expect(tap()).toEqual(fail("no_stamina"));
    step(STAMINA_RECHARGE_TICKS);
    expect(state.stamina.points).toBe(1);
    expect(tap()).toEqual(ok());
  });
});
