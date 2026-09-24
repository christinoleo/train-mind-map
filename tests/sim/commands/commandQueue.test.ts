import { describe, expect, it } from "vitest";
import { UNDO_DEPTH } from "../../../src/config/constants";
import type { Command } from "../../../src/sim/commands/command";
import { CommandQueue } from "../../../src/sim/commands/commandQueue";
import { EventQueue, type SimEvent } from "../../../src/sim/events";
import { ok } from "../../../src/sim/result";
import { createGameState } from "../../../src/sim/state/gameState";
import type { NodeId } from "../../../src/sim/state/ids";
import { tick } from "../../../src/sim/tick";
import { AddNode, RemoveNode } from "../support/testCommands";

function setup() {
  const state = createGameState("queue");
  const commands = new CommandQueue();
  const events = new EventQueue();
  const seen: SimEvent[] = [];
  events.on("CommandRejected", (e) => seen.push(e));
  const step = () => {
    tick(state, commands, events.emit);
    events.drain();
  };
  return { state, commands, seen, step };
}

const nodeIds = (state: { nodes: Map<NodeId, unknown> }) => [
  ...state.nodes.keys(),
];

describe("command queue", () => {
  it("applies nothing until the next tick", () => {
    const { state, commands, step } = setup();
    expect(commands.dispatch(state, new AddNode())).toEqual(ok());
    expect(state.nodes.size).toBe(0);
    step();
    expect(state.nodes.size).toBe(1);
  });

  it("applies queued commands in arrival order, before the systems run", () => {
    const state = createGameState("order");
    const commands = new CommandQueue();
    const order: string[] = [];
    const record = (name: string): Command => ({
      type: name,
      validate: () => ok(),
      apply: () => void order.push(name),
      invert: () => record(`undo ${name}`),
    });
    commands.dispatch(state, record("first"));
    commands.dispatch(state, record("second"));
    commands.dispatch(state, record("third"));
    tick(state, commands, () => {}, [() => void order.push("system")]);
    expect(order).toEqual(["first", "second", "third", "system"]);
  });

  it("revalidates each command against the state left by the ones before it", () => {
    const { state, commands, seen, step } = setup();
    commands.dispatch(state, new AddNode());
    step();
    const [id] = nodeIds(state);

    expect(commands.dispatch(state, new RemoveNode(id)).ok).toBe(true);
    expect(commands.dispatch(state, new RemoveNode(id)).ok).toBe(true);
    step();

    expect(state.nodes.size).toBe(0);
    expect(seen).toEqual([
      { type: "CommandRejected", command: "RemoveNode", reason: "not_found" },
    ]);
  });

  it("rejects an invalid command at dispatch without queueing it", () => {
    const { state, commands, step } = setup();
    const result = commands.dispatch(state, new RemoveNode(7 as NodeId));
    expect(result).toEqual({ ok: false, reason: "not_found" });
    step();
    expect(commands.replayLog).toEqual([]);
  });

  it("logs every applied command with its tick", () => {
    const { state, commands, step } = setup();
    step();
    const add = new AddNode();
    commands.dispatch(state, add);
    step();
    commands.undo(state);
    step();
    expect(commands.replayLog.map(([t, c]) => [t, c.type])).toEqual([
      [1, "AddNode"],
      [2, "RemoveNode"],
    ]);
  });
});

describe("undo", () => {
  it("round-trips a command through the queue", () => {
    const { state, commands, step } = setup();
    commands.dispatch(state, new AddNode());
    step();
    const [id] = nodeIds(state);
    commands.dispatch(state, new RemoveNode(id));
    step();
    expect(state.nodes.size).toBe(0);

    expect(commands.undo(state).ok).toBe(true);
    expect(state.nodes.size).toBe(0);
    step();
    expect(nodeIds(state)).toEqual([id]);

    commands.undo(state);
    step();
    expect(state.nodes.size).toBe(0);
    expect(commands.undo(state)).toEqual({
      ok: false,
      reason: "nothing_to_undo",
    });
  });

  it("fails when the inverse no longer validates", () => {
    const { state, commands, seen, step } = setup();
    commands.dispatch(state, new AddNode());
    step();
    const [id] = nodeIds(state);

    commands.dispatch(state, new RemoveNode(id));
    expect(commands.undo(state).ok).toBe(true);
    step();

    expect(state.nodes.size).toBe(0);
    expect(seen).toEqual([
      { type: "CommandRejected", command: "RemoveNode", reason: "not_found" },
    ]);
    expect(commands.undoDepth).toBe(1);
  });

  it(`keeps only the last ${UNDO_DEPTH} inverses`, () => {
    const { state, commands, step } = setup();
    for (let i = 0; i < UNDO_DEPTH + 5; i++) {
      commands.dispatch(state, new AddNode());
      step();
    }
    expect(commands.undoDepth).toBe(UNDO_DEPTH);
    while (commands.undo(state).ok) step();
    expect(state.nodes.size).toBe(5);
  });
});
