import { describe, expect, it } from "vitest";
import { CELL_PX } from "../../../src/config/constants";
import { MVP_SCENARIO } from "../../../src/data/scenarios/mvp";
import { Camera } from "../../../src/input/camera";
import { PlaceTool, type Ghost } from "../../../src/input/tools/place";
import { CommandQueue } from "../../../src/sim/commands/commandQueue";
import type { PlaceNode } from "../../../src/sim/commands/placeNode";
import type { FailReason } from "../../../src/sim/result";
import { createGameState } from "../../../src/sim/state/gameState";
import { fillCore } from "../../sim/support/stock";

/** A tool over the MVP map with the camera at scale 1, origin at (0, 0). */
function setup() {
  const state = createGameState(MVP_SCENARIO);
  fillCore(state);
  const commands = new CommandQueue();
  const camera = new Camera();
  const dispatched: PlaceNode[] = [];
  let ghost: Ghost | null = null;
  let hint: FailReason | null = null;
  const tool = new PlaceTool({
    state,
    camera,
    dispatch: (command) => {
      dispatched.push(command);
      return commands.dispatch(state, command);
    },
    showGhost: (g) => (ghost = g),
    showHint: (r) => (hint = r),
  });
  return {
    tool,
    dispatched,
    ghost: () => ghost,
    hint: () => hint,
  };
}

/** The screen point at the centre of cell (x, y). */
const cell = (x: number, y: number) => ({
  x: (x + 0.5) * CELL_PX,
  y: (y + 0.5) * CELL_PX,
});

describe("PlaceTool", () => {
  it("centres the ghost of a 3×3 kind on the cell under the pointer", () => {
    const { tool, ghost } = setup();
    tool.select("assembler-1", cell(46, 46));
    expect(ghost()).toMatchObject({ kind: "assembler-1", x: 45, y: 45 });
  });

  it("shows a valid ghost and no hint on open land", () => {
    const { tool, ghost, hint } = setup();
    tool.select("box", cell(46, 46));
    expect(ghost()?.valid).toBe(true);
    expect(hint()).toBeNull();
  });

  it("shows a red ghost with the reason on water", () => {
    const { tool, ghost, hint } = setup();
    tool.select("box", cell(80, 30));
    expect(ghost()?.valid).toBe(false);
    expect(hint()).toBe("on_water");
  });

  it("carries the deposit's resource on an Extractor's ghost", () => {
    const { tool, ghost } = setup();
    tool.select("extractor", cell(67, 60));
    expect(ghost()).toMatchObject({ valid: true, resource: "iron-ore" });
  });

  it("places on a tap where the ghost fits", () => {
    const { tool, dispatched } = setup();
    tool.select("furnace", cell(0, 0));
    tool.tap(cell(46, 46));
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toMatchObject({ kind: "furnace", x: 46, y: 46 });
  });

  it("places nothing on a tap where the ghost does not fit", () => {
    const { tool, dispatched } = setup();
    tool.select("furnace", cell(0, 0));
    tool.tap(cell(60, 60));
    expect(dispatched).toHaveLength(0);
  });

  it("takes a drag that starts on the ghost and pans for any other", () => {
    const { tool, ghost } = setup();
    tool.select("box", cell(46, 46));
    expect(tool.dragStart(cell(50, 50), cell(20, 20))).toBe(false);
    expect(tool.dragStart(cell(50, 50), cell(46, 46))).toBe(true);
    expect(ghost()).toMatchObject({ x: 50, y: 50 });
  });

  it("hides the ghost when deselected", () => {
    const { tool, ghost, hint } = setup();
    tool.select("box", cell(80, 30));
    tool.deselect();
    expect(ghost()).toBeNull();
    expect(hint()).toBeNull();
  });
});

describe("PlaceTool after a placement", () => {
  it("hides the ghost on the new node until it moves off", () => {
    const { tool, ghost, hint } = setup();
    tool.select("box", cell(46, 46));
    tool.tap(cell(46, 46));
    expect(ghost()).toBeNull();
    // The next tick applies the node; the refresh must not flag it occupied.
    tool.refresh();
    expect(ghost()).toBeNull();
    expect(hint()).toBeNull();
    tool.hover(cell(46, 50));
    expect(ghost()).toMatchObject({ x: 46, y: 50, valid: true });
  });

  it("lets every drag pan once a mouse steers the ghost", () => {
    const { tool } = setup();
    tool.select("box", cell(46, 46));
    tool.hover(cell(46, 46));
    expect(tool.dragStart(cell(50, 50), cell(46, 46))).toBe(false);
  });
});
