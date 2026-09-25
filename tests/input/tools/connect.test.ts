import { describe, expect, it } from "vitest";
import { CELL_PX } from "../../../src/config/constants";
import type { NodeKind } from "../../../src/data/nodes";
import { MVP_SCENARIO } from "../../../src/data/scenarios/mvp";
import { Camera } from "../../../src/input/camera";
import {
  ConnectTool,
  type EdgePreview,
} from "../../../src/input/tools/connect";
import { connectorsOf } from "../../../src/render/connectors";
import { CommandQueue } from "../../../src/sim/commands/commandQueue";
import type { ConnectEdge } from "../../../src/sim/commands/connectEdge";
import { EventQueue } from "../../../src/sim/events";
import { createGameState } from "../../../src/sim/state/gameState";
import {
  allocateId,
  type EdgeId,
  type NodeId,
} from "../../../src/sim/state/ids";
import { createNode } from "../../../src/sim/state/nodes";
import { tick } from "../../../src/sim/tick";
import { fillCore } from "../../sim/support/stock";

/**
 * A tool over the MVP map with the camera at scale 1, origin at (0, 0), on a
 * screen large enough that no test point sits in the auto-pan band.
 */
function setup() {
  const state = createGameState(MVP_SCENARIO);
  fillCore(state);
  const commands = new CommandQueue();
  const events = new EventQueue();
  const camera = new Camera();
  const dispatched: ConnectEdge[] = [];
  let preview: EdgePreview | null = null;
  let selected: EdgeId | null = null;
  let anchor: { x: number; y: number } | null = null;
  const tool = new ConnectTool({
    state,
    camera,
    viewport: () => ({ width: 4000, height: 4000 }),
    dispatch: (command) => {
      dispatched.push(command);
      return commands.dispatch(state, command);
    },
    showPreview: (p) => (preview = p),
    selectEdge: (id, at) => {
      selected = id;
      anchor = at ?? null;
    },
  });
  const put = (kind: NodeKind, x: number, y: number) => {
    const id = allocateId(state.nextIds, "node");
    state.nodes.set(id, createNode(id, kind, x, y));
    return id;
  };
  const step = () => tick(state, commands, events.emit);
  return {
    state,
    tool,
    put,
    step,
    dispatched,
    preview: () => preview,
    selected: () => selected,
    anchor: () => anchor,
  };
}

function connector(
  state: ReturnType<typeof setup>["state"],
  id: NodeId,
  side: "input" | "output",
  port = 0,
) {
  return connectorsOf(state.nodes.get(id)!, side)[port];
}

/** Drags from `from` to `to` in one frame, and releases there. */
function drag(
  tool: ConnectTool,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  const took = tool.dragStart(to, from);
  if (!took) return false;
  tool.dragMove(to);
  tool.frame(16);
  tool.dragEnd(to);
  return true;
}

describe("ConnectTool", () => {
  it("connects an output to an input with a drag", () => {
    const { state, tool, put, step, dispatched } = setup();
    const a = put("box", 50, 50);
    const b = put("box", 56, 50);
    expect(
      drag(tool, connector(state, a, "output"), connector(state, b, "input")),
    ).toBe(true);
    expect(dispatched).toHaveLength(1);
    step();
    expect(state.edges.size).toBe(1);
  });

  it("leaves a drag from open ground to the camera", () => {
    const { tool } = setup();
    expect(tool.dragStart({ x: 0, y: 0 }, { x: 40, y: 40 })).toBe(false);
  });

  it("leaves a drag from a node's body, away from its connectors, to the move", () => {
    const { state, tool, put } = setup();
    const a = put("box", 50, 50);
    const body = { x: 51 * CELL_PX, y: 51 * CELL_PX };
    expect(tool.dragStart(body, body)).toBe(false);
    const output = connector(state, a, "output");
    const inside = { x: output.x - CELL_PX * 0.4, y: output.y };
    expect(drag(tool, inside, { x: 60 * CELL_PX, y: 51 * CELL_PX })).toBe(true);
  });

  it("snaps to a free input when released on the node's body", () => {
    const { state, tool, put, dispatched } = setup();
    const a = put("box", 50, 50);
    const b = put("box", 56, 50);
    const body = { x: 57 * CELL_PX, y: 51.5 * CELL_PX };
    drag(tool, connector(state, a, "output"), body);
    expect(dispatched[0]?.to).toEqual({ node: b, port: 1 });
  });

  it("shows the length, cost and throughput of a long edge (FR54)", () => {
    const { state, tool, put, dispatched, preview } = setup();
    const a = put("box", 50, 50);
    const far = put("box", 66, 50);
    const to = connector(state, far, "input");
    tool.dragStart(to, connector(state, a, "output"));
    tool.dragMove(to);
    tool.frame(16);
    expect(preview()).toMatchObject({
      reason: null,
      length: 14,
      stats: { cost: { "iron-ore": 16 }, throughput: 1 },
    });
    tool.dragEnd(to);
    expect(dispatched).toHaveLength(1);
    expect(preview()).toBeNull();
  });

  it("shows a red preview and builds nothing when released on open ground", () => {
    const { state, tool, put, dispatched, preview } = setup();
    const a = put("box", 50, 50);
    const ground = { x: 54.5 * CELL_PX, y: 54.5 * CELL_PX };
    tool.dragStart(ground, connector(state, a, "output"));
    tool.dragMove(ground);
    tool.frame(16);
    expect(preview()).toMatchObject({ reason: "no_target" });
    tool.dragEnd(ground);
    expect(dispatched).toHaveLength(0);
  });

  it("routes at most once per frame, and only on a new cell", () => {
    const { state, tool, put, preview } = setup();
    const a = put("box", 50, 50);
    tool.dragStart({ x: 900, y: 810 }, connector(state, a, "output"));
    tool.frame(16);
    const first = preview();
    tool.dragMove({ x: 901, y: 811 });
    tool.frame(16);
    expect(preview()).toBe(first);
  });

  it("opens the bubble of a tapped edge at the tap, and closes it on open ground", () => {
    const { state, tool, put, step, selected, anchor } = setup();
    const a = put("box", 50, 50);
    const b = put("box", 56, 50);
    drag(tool, connector(state, a, "output"), connector(state, b, "input"));
    step();
    const [edge] = state.edges.values();
    expect(tool.tap({ x: 54 * CELL_PX, y: 50.5 * CELL_PX })).toBe(true);
    expect(selected()).toBe(edge.id);
    expect(anchor()).toEqual({ x: 54 * CELL_PX, y: 50.5 * CELL_PX });
    expect(tool.tap({ x: 54 * CELL_PX, y: 56 * CELL_PX })).toBe(false);
    expect(selected()).toBeNull();
  });
});
