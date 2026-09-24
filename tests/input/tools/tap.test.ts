import { describe, expect, it } from "vitest";
import { CELL_PX } from "../../../src/config/constants";
import { MVP_SCENARIO } from "../../../src/data/scenarios/mvp";
import { Camera } from "../../../src/input/camera";
import { TapTool } from "../../../src/input/tools/tap";
import { CommandQueue } from "../../../src/sim/commands/commandQueue";
import type { ManualTap } from "../../../src/sim/commands/manualTap";
import type { FailReason } from "../../../src/sim/result";
import { createGameState } from "../../../src/sim/state/gameState";

/** A tool over the MVP map with the camera at scale 1, origin at (0, 0). */
function setup() {
  const state = createGameState(MVP_SCENARIO);
  const commands = new CommandQueue();
  const dispatched: ManualTap[] = [];
  let hint: FailReason | null = null;
  const tool = new TapTool({
    state,
    camera: new Camera(),
    dispatch: (command) => {
      dispatched.push(command);
      return commands.dispatch(state, command);
    },
    showHint: (r) => (hint = r),
  });
  return { state, tool, dispatched, hint: () => hint };
}

/** A screen point inside cell (x, y), off its centre. */
const cell = (x: number, y: number) => ({
  x: (x + 0.9) * CELL_PX,
  y: (y + 0.1) * CELL_PX,
});

describe("TapTool", () => {
  it("taps the cell under the pointer", () => {
    const { tool, dispatched, hint } = setup();
    tool.tap(cell(66, 60));
    expect(dispatched.map(({ x, y }) => [x, y])).toEqual([[66, 60]]);
    expect(hint()).toBeNull();
  });

  it("stays silent on bare ground", () => {
    const { tool, hint } = setup();
    tool.tap(cell(46, 46));
    expect(hint()).toBeNull();
  });

  it("says when stamina ran out, until a point comes back", () => {
    const { state, tool, hint } = setup();
    state.stamina.points = 0;
    tool.tap(cell(66, 60));
    expect(hint()).toBe("no_stamina");
    tool.refresh();
    expect(hint()).toBe("no_stamina");
    state.stamina.points = 1;
    tool.refresh();
    expect(hint()).toBeNull();
  });
});
