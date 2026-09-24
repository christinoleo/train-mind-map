import { describe, expect, it } from "vitest";
import { MVP_SCENARIO } from "../../src/data/scenarios/mvp";
import { CommandQueue } from "../../src/sim/commands/commandQueue";
import { ConnectEdge } from "../../src/sim/commands/connectEdge";
import { EventQueue } from "../../src/sim/events";
import { createGameState } from "../../src/sim/state/gameState";
import { allocateId, type EdgeId } from "../../src/sim/state/ids";
import { createNode } from "../../src/sim/state/nodes";
import { tick } from "../../src/sim/tick";
import { edgeMenuInfo } from "../../src/ui/EdgeMenu";
import { fillCore } from "../sim/support/stock";

function connected() {
  const state = createGameState(MVP_SCENARIO);
  fillCore(state);
  const put = (x: number) => {
    const id = allocateId(state.nextIds, "node");
    state.nodes.set(id, createNode(id, "box", x, 50));
    return id;
  };
  const a = put(50);
  const b = put(56);
  const commands = new CommandQueue();
  commands.dispatch(
    state,
    new ConnectEdge({ node: a, port: 0 }, { node: b, port: 0 }),
  );
  tick(state, commands, new EventQueue().emit);
  const [edge] = state.edges.values();
  return { state, id: edge.id };
}

describe("edgeMenuInfo", () => {
  it("shows the refund and the next level, refused until researched", () => {
    const { state, id } = connected();
    expect(edgeMenuInfo(state, id)).toEqual({
      level: 1,
      length: 4,
      refund: { "iron-ore": 4 },
      upgrade: { level: 2, cost: { gear: 4 }, refused: "locked" },
    });
    state.edgeLevel = 2;
    expect(edgeMenuInfo(state, id)?.upgrade?.refused).toBeNull();
  });

  it("is null for an edge that is gone", () => {
    const { state } = connected();
    expect(edgeMenuInfo(state, 99 as EdgeId)).toBeNull();
  });
});
