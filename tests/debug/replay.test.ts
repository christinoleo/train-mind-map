import { describe, expect, it } from "vitest";
import { MVP_SCENARIO } from "../../src/data/scenarios/mvp";
import { GiveItems } from "../../src/debug/cheats";
import { decodeReplay, encodeReplay } from "../../src/debug/replay";
import type { Scenario } from "../../src/data/scenarios/scenario";
import type { Command } from "../../src/sim/commands/command";
import { CommandQueue } from "../../src/sim/commands/commandQueue";
import { ConnectEdge } from "../../src/sim/commands/connectEdge";
import { MoveNode } from "../../src/sim/commands/moveNode";
import { PlaceNode } from "../../src/sim/commands/placeNode";
import { RemoveNode } from "../../src/sim/commands/removeNode";
import { SetRecipe } from "../../src/sim/commands/setRecipe";
import { EventQueue } from "../../src/sim/events";
import { fail } from "../../src/sim/result";
import { createGameState } from "../../src/sim/state/gameState";
import type { NodeId } from "../../src/sim/state/ids";
import { hashState } from "../../src/sim/state/serialize";
import { tick } from "../../src/sim/tick";

function game(world: string | Scenario) {
  const state = createGameState(world);
  const commands = new CommandQueue();
  const events = new EventQueue();
  const step = () => {
    tick(state, commands, events.emit);
    events.drain();
  };
  return { state, commands, step };
}

/** Builds, moves, re-recipes, removes and undoes over a few dozen ticks. */
function play() {
  const g = game(MVP_SCENARIO);
  const at = (t: number, command: Command | "undo") => {
    while (g.state.tick < t) g.step();
    if (command === "undo") g.commands.undo(g.state);
    else g.commands.dispatch(g.state, command);
  };
  const a = 2 as NodeId;
  const b = 3 as NodeId;
  at(0, new GiveItems(100));
  at(2, new PlaceNode("box", 50, 50));
  at(3, new PlaceNode("furnace", 56, 50));
  at(5, new ConnectEdge({ node: a, port: 0 }, { node: b, port: 0 }));
  at(8, new MoveNode(b, 58, 52));
  at(9, new SetRecipe(b, "brick"));
  at(12, "undo");
  at(15, new PlaceNode("box", 40, 40));
  at(16, new RemoveNode(4 as NodeId));
  at(20, "undo");
  at(40, "undo");
  while (g.state.tick < 60) g.step();
  return g;
}

describe("replay (FR159)", () => {
  it("plays a game again from its exported text", () => {
    const played = play();
    // The last undo took the second Box back off; the move stands.
    expect(played.state.nodes.size).toBe(3);
    expect(played.state.nodes.get(3 as NodeId)).toMatchObject({ x: 58, y: 52 });
    const text = encodeReplay(
      MVP_SCENARIO,
      played.state.tick,
      played.commands.replayLog,
    );
    const replay = decodeReplay(text);
    if (!replay.ok) throw new Error(replay.reason);
    expect(replay.value.world).toBe(MVP_SCENARIO);
    expect(replay.value.tick).toBe(60);

    const again = game(replay.value.world);
    again.commands.schedule(replay.value.log);
    while (again.state.tick < replay.value.tick) again.step();
    expect(hashState(again.state)).toBe(hashState(played.state));
  });

  it("names a free seed's world by its seed", () => {
    const text = encodeReplay("abc", 0, []);
    const replay = decodeReplay(text);
    expect(replay.ok && replay.value.world).toBe("abc");
  });

  it("refuses text that is not a replay", () => {
    expect(decodeReplay("nope")).toEqual(fail("bad_replay"));
    expect(decodeReplay("{}")).toEqual(fail("bad_replay"));
    const text = encodeReplay("abc", 0, []);
    const unknown = text.replace('"log":[]', '"log":[[0,"Explode"]]');
    expect(decodeReplay(unknown)).toEqual(fail("bad_replay"));
    const malformed = text.replace('"log":[]', '"log":[[5,"ConnectEdge",1]]');
    expect(decodeReplay(malformed)).toEqual(fail("bad_replay"));
  });
});
