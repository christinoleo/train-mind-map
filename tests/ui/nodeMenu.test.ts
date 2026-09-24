import { describe, expect, it } from "vitest";
import type { NodeKind } from "../../src/data/nodes";
import { MVP_SCENARIO } from "../../src/data/scenarios/mvp";
import { createGameState } from "../../src/sim/state/gameState";
import { allocateId, type NodeId } from "../../src/sim/state/ids";
import { createNode } from "../../src/sim/state/nodes";
import { nodeMenuInfo } from "../../src/ui/NodeMenu";
import { fillCore } from "../sim/support/stock";

function setup() {
  const state = createGameState(MVP_SCENARIO);
  fillCore(state);
  const put = (kind: NodeKind) => {
    const id = allocateId(state.nextIds, "node");
    state.nodes.set(id, createNode(id, kind, 45, 45));
    return id;
  };
  return { state, put };
}

describe("nodeMenuInfo", () => {
  it("offers a Furnace its smelting recipes and the automatic pick", () => {
    const { state, put } = setup();
    const info = nodeMenuInfo(state, put("furnace"));
    expect(info?.recipes).toEqual({
      current: null,
      options: [null, "iron-plate", "copper-plate", "brick"],
    });
    expect(info?.upgrade).toBeNull();
    expect(info?.refund).toEqual({ stone: 10 });
  });

  it("offers an Assembler its upgrade, refused until researched", () => {
    const { state, put } = setup();
    const id = put("assembler-1");
    expect(nodeMenuInfo(state, id)?.upgrade).toEqual({
      kind: "assembler-2",
      cost: { "iron-plate": 20, gear: 10, circuit: 10 },
      refused: "locked",
    });
    state.unlockedNodes.push("assembler-2");
    expect(nodeMenuInfo(state, id)?.upgrade?.refused).toBeNull();
  });

  it("lets the Core stay, and closes on a missing node", () => {
    const { state } = setup();
    expect(nodeMenuInfo(state, 1 as NodeId)?.refund).toBeNull();
    expect(nodeMenuInfo(state, 99 as NodeId)).toBeNull();
  });
});
