import { describe, expect, it } from "vitest";
import { REMOVED_TOAST_MS } from "../../src/config/constants";
import { MVP_SCENARIO } from "../../src/data/scenarios/mvp";
import { CommandQueue } from "../../src/sim/commands/commandQueue";
import { ManualTap } from "../../src/sim/commands/manualTap";
import { PlaceNode } from "../../src/sim/commands/placeNode";
import { RemoveNode } from "../../src/sim/commands/removeNode";
import { EventQueue } from "../../src/sim/events";
import { createGameState } from "../../src/sim/state/gameState";
import type { NodeId } from "../../src/sim/state/ids";
import { tick } from "../../src/sim/tick";
import { RemovalUndo } from "../../src/ui/removalUndo";
import { fillCore } from "../sim/support/stock";

/** A placed Box, and the toast's controller over the game's command queue. */
function setup() {
  const state = createGameState(MVP_SCENARIO);
  fillCore(state);
  const commands = new CommandQueue();
  const events = new EventQueue();
  const removal = new RemovalUndo(commands);
  const { shown } = removal;
  const step = (now = 0) => {
    tick(state, commands, events.emit);
    removal.update(now);
  };
  const place = (x: number, y: number) => {
    expect(commands.dispatch(state, new PlaceNode("box", x, y)).ok).toBe(true);
    step();
    return [...state.nodes.values()].find((n) => n.x === x && n.y === y)!
      .id as NodeId;
  };
  const remove = (id: NodeId, now = 0) => {
    const command = new RemoveNode(id);
    expect(commands.dispatch(state, command).ok).toBe(true);
    removal.removed(command, now);
    step(now);
  };
  return { state, commands, shown, removal, step, place, remove };
}

describe("RemovalUndo: the 'Removido · Desfazer' toast", () => {
  it("brings the removed node back and hides", () => {
    const t = setup();
    const box = t.place(50, 50);
    t.remove(box);
    expect(t.state.nodes.has(box)).toBe(false);
    expect(t.shown.value).toBe(true);
    expect(t.removal.undo(t.state)?.ok).toBe(true);
    expect(t.shown.value).toBe(false);
    t.step();
    expect(t.state.nodes.get(box)).toMatchObject({ x: 50, y: 50 });
  });

  it("hides once its time is up", () => {
    const t = setup();
    t.remove(t.place(50, 50), 1000);
    t.step(1000 + REMOVED_TOAST_MS - 1);
    expect(t.shown.value).toBe(true);
    t.step(1000 + REMOVED_TOAST_MS);
    expect(t.shown.value).toBe(false);
    expect(t.removal.undo(t.state)).toBeNull();
  });

  it("never undoes anything built after the removal", () => {
    const t = setup();
    t.remove(t.place(50, 50));
    const later = t.place(50, 44);
    expect(t.shown.value).toBe(false);
    expect(t.removal.undo(t.state)).toBeNull();
    t.step();
    expect(t.state.nodes.has(later)).toBe(true);
  });

  it("stays through a hand tap, which undo does not take back", () => {
    const t = setup();
    const box = t.place(50, 50);
    t.remove(box);
    const [deposit] = t.state.map.deposits;
    expect(
      t.commands.dispatch(t.state, new ManualTap(deposit.x, deposit.y)).ok,
    ).toBe(true);
    t.step();
    expect(t.shown.value).toBe(true);
  });
});
