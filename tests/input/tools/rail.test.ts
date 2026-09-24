import { describe, expect, it } from "vitest";
import { CELL_PX } from "../../../src/config/constants";
import type { NodeKind } from "../../../src/data/nodes";
import { MVP_SCENARIO } from "../../../src/data/scenarios/mvp";
import { Camera } from "../../../src/input/camera";
import type { EdgePreview } from "../../../src/input/tools/connect";
import { RailTool } from "../../../src/input/tools/rail";
import { cellCentre } from "../../../src/render/connectors";
import { CommandQueue } from "../../../src/sim/commands/commandQueue";
import type { PlaceRail } from "../../../src/sim/commands/placeRail";
import { EventQueue } from "../../../src/sim/events";
import { railPorts } from "../../../src/sim/rail/station";
import { createGameState } from "../../../src/sim/state/gameState";
import {
  allocateId,
  type NodeId,
  type RailId,
} from "../../../src/sim/state/ids";
import { createNode } from "../../../src/sim/state/nodes";
import { tick } from "../../../src/sim/tick";
import { fillCore } from "../../sim/support/stock";

/** A rail tool over the MVP map, the camera at scale 1 and origin (0, 0). */
function setup() {
  const state = createGameState(MVP_SCENARIO);
  fillCore(state);
  const commands = new CommandQueue();
  const events = new EventQueue();
  const dispatched: PlaceRail[] = [];
  let preview: EdgePreview | null = null;
  let selected: RailId | null = null;
  const tool = new RailTool({
    state,
    camera: new Camera(),
    viewport: () => ({ width: 4000, height: 4000 }),
    dispatch: (command) => {
      dispatched.push(command);
      return commands.dispatch(state, command);
    },
    showPreview: (p) => (preview = p),
    selectRail: (id) => (selected = id),
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
  };
}

type Setup = ReturnType<typeof setup>;

/** The centre of rail port `port` of Station `id`, in world units. */
function port(s: Setup, id: NodeId, i: number) {
  return cellCentre(railPorts(s.state.nodes.get(id) as never)[i].cell);
}

/** Drags from `from` to `to` in one frame, and releases there. */
function drag(
  tool: RailTool,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  const took = tool.dragStart(to, from);
  tool.frame(0);
  tool.dragEnd(to);
  return took;
}

describe("the rail tool (FR79)", () => {
  it("builds a rail from one rail port to another", () => {
    const s = setup();
    const a = s.put("station", 50, 50);
    const b = s.put("station", 60, 50);
    expect(drag(s.tool, port(s, a, 1), port(s, b, 0))).toBe(true);
    expect(s.dispatched).toHaveLength(1);
    expect(s.dispatched[0].from).toEqual({ node: a, port: 1 });
    expect(s.dispatched[0].to).toEqual({ node: b, port: 0 });
    s.step();
    expect(s.state.rails.size).toBe(1);
    expect(s.preview()).toBeNull();
  });

  it("snaps a release on a Station to its nearest free rail port", () => {
    const s = setup();
    const a = s.put("station", 50, 50);
    const b = s.put("station", 60, 50);
    // Over the card's right half: the right port is nearer.
    const over = { x: 61.8 * CELL_PX, y: 51 * CELL_PX };
    drag(s.tool, port(s, a, 1), over);
    expect(s.dispatched[0]?.to).toEqual({ node: b, port: 1 });
  });

  it("does not take a drag that starts off a rail port", () => {
    const s = setup();
    s.put("station", 50, 50);
    expect(s.tool.dragStart({ x: 0, y: 0 }, { x: 40, y: 40 })).toBe(false);
  });

  it("shows red with a reason over open ground, and builds nothing", () => {
    const s = setup();
    const a = s.put("station", 50, 50);
    const from = port(s, a, 1);
    const to = cellCentre({ x: 58, y: 55 });
    s.tool.dragStart(to, from);
    s.tool.frame(0);
    expect(s.preview()?.reason).toBe("no_target");
    expect(s.preview()?.lines[0].length).toBeGreaterThan(1);
    s.tool.dragEnd(to);
    expect(s.dispatched).toHaveLength(0);
  });

  it("shows green over a reachable rail port", () => {
    const s = setup();
    const a = s.put("station", 50, 50);
    const b = s.put("station", 60, 50);
    const to = port(s, b, 0);
    s.tool.dragStart(to, port(s, a, 1));
    s.tool.frame(0);
    expect(s.preview()?.reason).toBeNull();
  });

  it("opens the menu of a tapped rail", () => {
    const s = setup();
    const a = s.put("station", 50, 50);
    const b = s.put("station", 60, 50);
    drag(s.tool, port(s, a, 1), port(s, b, 0));
    s.step();
    s.tool.tap(cellCentre({ x: 55, y: 51 }));
    expect(s.selected()).toBe([...s.state.rails.keys()][0]);
    s.tool.tap({ x: 0, y: 0 });
    expect(s.selected()).toBeNull();
  });
});
