import { describe, expect, it } from "vitest";
import { CELL_PX, DRAG_THRESHOLD_PX } from "../../../src/config/constants";
import { MVP_SCENARIO } from "../../../src/data/scenarios/mvp";
import { Camera } from "../../../src/input/camera";
import { GestureTracker, type GesturePoint } from "../../../src/input/gestures";
import { BuildTool } from "../../../src/input/tools/build";
import {
  ConnectTool,
  type EdgePreview,
} from "../../../src/input/tools/connect";
import { MoveTool } from "../../../src/input/tools/move";
import { TapTool } from "../../../src/input/tools/tap";
import { connectorsOf } from "../../../src/render/connectors";
import { CommandQueue } from "../../../src/sim/commands/commandQueue";
import { createGameState } from "../../../src/sim/state/gameState";
import {
  allocateId,
  type EdgeId,
  type NodeId,
} from "../../../src/sim/state/ids";
import { createNode } from "../../../src/sim/state/nodes";
import { fillCore } from "../../sim/support/stock";

/**
 * A Box on the MVP map and the build tool fed by a gesture tracker, as the
 * controls feed it, with the camera at scale 1.
 */
function setup() {
  const state = createGameState(MVP_SCENARIO);
  fillCore(state);
  const commands = new CommandQueue();
  const camera = new Camera();
  const viewport = () => ({ width: 4000, height: 4000 });
  const dispatch = (command: Parameters<CommandQueue["dispatch"]>[1]) =>
    commands.dispatch(state, command);
  let node: NodeId | null = null;
  let edge: EdgeId | null = null;
  let moving: NodeId | null = null;
  let preview: EdgePreview | null = null;
  const tool = new BuildTool({
    state,
    camera,
    tapTool: new TapTool({ state, camera, dispatch, showHint() {} }),
    connectTool: new ConnectTool({
      state,
      camera,
      viewport,
      dispatch,
      showPreview: (p) => (preview = p),
      selectEdge: (id) => (edge = id),
    }),
    moveTool: new MoveTool({
      state,
      camera,
      viewport,
      dispatch,
      showGhost() {},
      showPreview: (p) => (preview = p),
      showMoving: (id) => (moving = id),
      showDrop() {},
      showHint() {},
    }),
    selectedNode: () => node,
    selectNode: (id) => (node = id),
    deselect: () => {
      node = null;
      edge = null;
    },
    showDepositName() {},
  });
  let took = false;
  const gestures = new GestureTracker({
    tap: (p) => tool.tap(p),
    dragStart: (p, from) => (took = tool.dragStart(p, from)),
    dragMove: (p) => tool.dragMove(p),
    dragEnd: (p) => tool.dragEnd(p),
    cancel: () => tool.cancel(),
    pinch() {},
  });
  const id = allocateId(state.nextIds, "node");
  state.nodes.set(id, createNode(id, "box", 50, 50));
  return {
    state,
    tool,
    gestures,
    box: id,
    /** Presses at `at`, moves by (`dx`, `dy`) and holds there. */
    press(at: GesturePoint, dx = 0, dy = 0) {
      gestures.down(1, at.x, at.y);
      gestures.move(1, at.x + dx, at.y + dy);
    },
    release: () => gestures.up(1),
    selected: () => ({ node, edge }),
    moving: () => moving,
    preview: () => preview,
    took: () => took,
  };
}

/** The screen point at the centre of cell (x, y). */
const cell = (x: number, y: number) => ({
  x: (x + 0.5) * CELL_PX,
  y: (y + 0.5) * CELL_PX,
});

describe("BuildTool: tap selects, drag acts (FR19, FR20, FR134)", () => {
  it("selects a node tapped on its body, within the drag threshold", () => {
    const t = setup();
    t.press(cell(50, 50), DRAG_THRESHOLD_PX, 0);
    t.release();
    expect(t.selected().node).toBe(t.box);
    expect(t.moving()).toBeNull();
  });

  it("lifts a node dragged from its body past the threshold, closing its bubble", () => {
    const t = setup();
    t.press(cell(50, 50));
    t.release();
    expect(t.selected().node).toBe(t.box);
    t.press(cell(50, 50), DRAG_THRESHOLD_PX + 1, 0);
    expect(t.took()).toBe(true);
    expect(t.moving()).toBe(t.box);
    expect(t.selected()).toEqual({ node: null, edge: null });
    t.release();
    expect(t.moving()).toBeNull();
    // Releasing a drag is no tap: no bubble comes back.
    expect(t.selected().node).toBeNull();
  });

  it("connects from an output connector instead of lifting the node", () => {
    const t = setup();
    const out = connectorsOf(t.state.nodes.get(t.box)!, "output")[0];
    t.press(out, CELL_PX, 0);
    t.tool.frame(16);
    expect(t.took()).toBe(true);
    expect(t.moving()).toBeNull();
    expect(t.preview()).not.toBeNull();
    expect(t.selected().node).toBeNull();
  });

  it("closes the bubble on a tap on empty map and on a pan", () => {
    const t = setup();
    t.press(cell(50, 50));
    t.release();
    t.press(cell(40, 40));
    t.release();
    expect(t.selected().node).toBeNull();

    t.press(cell(50, 50));
    t.release();
    t.press(cell(40, 40), 0, DRAG_THRESHOLD_PX + 1);
    // Nothing takes a drag on open ground: the camera pans.
    expect(t.took()).toBe(false);
    expect(t.selected().node).toBeNull();
  });
});
