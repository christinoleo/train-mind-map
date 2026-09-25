import { describe, expect, it } from "vitest";
import { CELL_PX } from "../../../src/config/constants";
import { MVP_SCENARIO } from "../../../src/data/scenarios/mvp";
import { Camera } from "../../../src/input/camera";
import type { EdgePreview } from "../../../src/input/tools/connect";
import { MoveTool } from "../../../src/input/tools/move";
import type { Ghost } from "../../../src/input/tools/place";
import { CommandQueue } from "../../../src/sim/commands/commandQueue";
import { ConnectEdge } from "../../../src/sim/commands/connectEdge";
import { EventQueue } from "../../../src/sim/events";
import type { FailReason } from "../../../src/sim/result";
import { createGameState } from "../../../src/sim/state/gameState";
import { allocateId, type NodeId } from "../../../src/sim/state/ids";
import { createNode } from "../../../src/sim/state/nodes";
import { tick } from "../../../src/sim/tick";
import { fillCore } from "../../sim/support/stock";

/** Two joined Boxes, and a move tool with the camera at scale 1. */
function setup() {
  const state = createGameState(MVP_SCENARIO);
  fillCore(state);
  const commands = new CommandQueue();
  const events = new EventQueue();
  const put = (x: number, y: number) => {
    const id = allocateId(state.nextIds, "node");
    state.nodes.set(id, createNode(id, "box", x, y));
    return id;
  };
  const a = put(50, 50);
  const b = put(56, 50);
  commands.dispatch(
    state,
    new ConnectEdge({ node: a, port: 0 }, { node: b, port: 0 }),
  );
  const step = () => tick(state, commands, events.emit);
  step();
  let ghost: Ghost | null = null;
  let preview: EdgePreview | null = null;
  let moving: NodeId | null = null;
  const hints: FailReason[] = [];
  const tool = new MoveTool({
    state,
    camera: new Camera(),
    viewport: () => ({ width: 4000, height: 4000 }),
    dispatch: (command) => commands.dispatch(state, command),
    showGhost: (g) => (ghost = g),
    showPreview: (p) => (preview = p),
    showMoving: (id) => (moving = id),
    showHint: (reason) => hints.push(reason),
  });
  return {
    state,
    tool,
    step,
    b,
    hints,
    ghost: () => ghost,
    preview: () => preview,
    moving: () => moving,
  };
}

/** The screen point at the centre of cell (x, y). */
const cell = (x: number, y: number) => ({
  x: (x + 0.5) * CELL_PX,
  y: (y + 0.5) * CELL_PX,
});

describe("MoveTool (FR20)", () => {
  it("grabs a node with a drag from its body and moves it where the drag ends", () => {
    const t = setup();
    expect(t.tool.dragStart(cell(57, 51), cell(56, 50))).toBe(true);
    expect(t.moving()).toBe(t.b);
    t.tool.frame(16);
    expect(t.ghost()).toMatchObject({ kind: "box", x: 57, y: 51, valid: true });
    expect(t.preview()?.reason).toBeNull();
    expect(t.preview()?.lines).toHaveLength(1);

    t.tool.dragEnd(cell(58, 52));
    expect(t.moving()).toBeNull();
    expect(t.ghost()).toBeNull();
    t.step();
    expect(t.state.nodes.get(t.b)).toMatchObject({ x: 58, y: 52 });
  });

  it("leaves the node where it was when the move is refused, and tells why", () => {
    const t = setup();
    t.tool.dragStart(cell(70, 50), cell(56, 50));
    t.tool.frame(16);
    expect(t.ghost()?.valid).toBe(false);
    expect(t.preview()).toMatchObject({ reason: "out_of_range", length: 18 });
    t.tool.dragEnd(cell(70, 50));
    t.step();
    expect(t.state.nodes.get(t.b)).toMatchObject({ x: 56, y: 50 });
    expect(t.hints).toEqual(["out_of_range"]);
  });

  it("takes no drag from open ground, and never the Core", () => {
    const t = setup();
    expect(t.tool.dragStart(cell(41, 41), cell(40, 40))).toBe(false);
    expect(t.moving()).toBeNull();
    expect(t.tool.dragStart(cell(61, 61), cell(60, 60))).toBe(false);
    expect(t.hints).toEqual(["immovable"]);
  });

  it("drops the grab when cancelled", () => {
    const t = setup();
    t.tool.dragStart(cell(57, 51), cell(56, 50));
    t.tool.cancel();
    expect(t.moving()).toBeNull();
    t.tool.dragEnd(cell(58, 52));
    t.step();
    expect(t.state.nodes.get(t.b)).toMatchObject({ x: 56, y: 50 });
  });
});
