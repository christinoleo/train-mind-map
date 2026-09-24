import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTO_PAN_EDGE_PX,
  AUTO_PAN_SPEED_PX_S,
  DRAG_THRESHOLD_PX,
  LONG_PRESS_MS,
} from "../../src/config/constants";
import {
  autoPanVelocity,
  GestureTracker,
  type GestureHandlers,
  type Timers,
} from "../../src/input/gestures";

/** Timers driven by hand: `advance` runs what is due. */
function fakeTimers() {
  let now = 0;
  let next = 1;
  const pending = new Map<number, { at: number; callback: () => void }>();
  const timers: Timers = {
    set(callback, ms) {
      pending.set(next, { at: now + ms, callback });
      return next++;
    },
    clear(handle) {
      pending.delete(handle);
    },
  };
  const advance = (ms: number) => {
    now += ms;
    for (const [handle, { at, callback }] of [...pending]) {
      if (at > now) continue;
      pending.delete(handle);
      callback();
    }
  };
  return { timers, advance };
}

function setup() {
  const calls: string[] = [];
  const handlers: GestureHandlers = {
    tap: vi.fn(() => calls.push("tap")),
    longPress: vi.fn(() => calls.push("longPress")),
    holdEnd: vi.fn(() => calls.push("holdEnd")),
    dragStart: vi.fn(() => calls.push("dragStart")),
    dragMove: vi.fn(() => calls.push("dragMove")),
    dragEnd: vi.fn(() => calls.push("dragEnd")),
    cancel: vi.fn(() => calls.push("cancel")),
    pinch: vi.fn(() => calls.push("pinch")),
  };
  const clock = fakeTimers();
  const tracker = new GestureTracker(handlers, clock.timers);
  return { tracker, handlers, calls, advance: clock.advance };
}

describe("GestureTracker", () => {
  let t: ReturnType<typeof setup>;
  beforeEach(() => {
    t = setup();
  });

  it("reports a tap when the pointer moves no more than the threshold", () => {
    t.tracker.down(1, 100, 100);
    t.tracker.move(1, 100 + DRAG_THRESHOLD_PX, 100);
    t.advance(LONG_PRESS_MS - 1);
    t.tracker.up(1);
    expect(t.calls).toEqual(["tap"]);
    expect(t.handlers.tap).toHaveBeenCalledWith({ x: 108, y: 100 });
  });

  it("reports a drag once the pointer moves past the threshold", () => {
    t.tracker.down(1, 100, 100);
    t.tracker.move(1, 100, 100 + DRAG_THRESHOLD_PX + 1);
    t.tracker.move(1, 100, 120);
    t.tracker.up(1);
    expect(t.calls).toEqual(["dragStart", "dragMove", "dragMove", "dragEnd"]);
    expect(t.handlers.dragStart).toHaveBeenCalledWith(
      { x: 100, y: 109 },
      { x: 100, y: 100 },
      false,
    );
    // The first move carries the whole distance from where the pointer went down.
    expect(t.handlers.dragMove).toHaveBeenNthCalledWith(
      1,
      { x: 100, y: 109 },
      0,
      9,
    );
    expect(t.handlers.dragMove).toHaveBeenNthCalledWith(
      2,
      { x: 100, y: 120 },
      0,
      11,
    );
  });

  it("fires a long press after 500 ms without movement, and no tap", () => {
    t.tracker.down(1, 50, 60);
    t.advance(LONG_PRESS_MS - 1);
    expect(t.calls).toEqual([]);
    t.advance(1);
    expect(t.handlers.longPress).toHaveBeenCalledWith({ x: 50, y: 60 });
    t.tracker.up(1);
    expect(t.calls).toEqual(["longPress", "holdEnd"]);
  });

  it("does not fire a long press once the pointer drags", () => {
    t.tracker.down(1, 0, 0);
    t.tracker.move(1, 20, 0);
    t.advance(LONG_PRESS_MS * 2);
    expect(t.handlers.longPress).not.toHaveBeenCalled();
  });

  it("marks a drag that follows a long press as held", () => {
    t.tracker.down(1, 0, 0);
    t.advance(LONG_PRESS_MS);
    t.tracker.move(1, 20, 0);
    t.tracker.up(1);
    expect(t.calls).toEqual(["longPress", "dragStart", "dragMove", "dragEnd"]);
    expect(t.handlers.dragStart).toHaveBeenCalledWith(
      { x: 20, y: 0 },
      { x: 0, y: 0 },
      true,
    );
  });

  it("cancels on a second finger and pinches around the midpoint", () => {
    t.tracker.down(1, 100, 100);
    t.tracker.move(1, 120, 100);
    t.tracker.down(2, 200, 100);
    t.tracker.move(2, 220, 100);
    t.advance(LONG_PRESS_MS);
    t.tracker.up(1);
    t.tracker.up(2);
    expect(t.calls).toEqual(["dragStart", "dragMove", "cancel", "pinch"]);
    // The fingers were 80 px apart and are now 100 px apart.
    expect(t.handlers.pinch).toHaveBeenCalledWith(170, 100, 10, 0, 1.25);
  });

  it("cancels a pending tap on a second finger", () => {
    t.tracker.down(1, 100, 100);
    t.tracker.down(2, 200, 100);
    t.tracker.up(2);
    t.tracker.up(1);
    t.advance(LONG_PRESS_MS);
    expect(t.calls).toEqual(["cancel"]);
  });

  it("keeps panning with the finger left after a pinch", () => {
    t.tracker.down(1, 0, 0);
    t.tracker.down(2, 100, 0);
    t.tracker.up(2);
    t.tracker.move(1, 30, 40);
    expect(t.handlers.pinch).toHaveBeenLastCalledWith(30, 40, 30, 40, 1);
    t.tracker.up(1);
    expect(t.handlers.tap).not.toHaveBeenCalled();
    expect(t.handlers.dragEnd).not.toHaveBeenCalled();
  });

  it("ends a drag without a tap when the browser cancels the pointer", () => {
    t.tracker.down(1, 0, 0);
    t.tracker.cancelPointer(1);
    t.tracker.down(1, 0, 0);
    t.tracker.move(1, 50, 0);
    t.tracker.cancelPointer(1);
    expect(t.calls).toEqual(["dragStart", "dragMove", "dragEnd"]);
  });
});

describe("autoPanVelocity", () => {
  it("is zero away from the edges", () => {
    expect(autoPanVelocity(200, 400, 400, 800)).toEqual({ vx: 0, vy: 0 });
  });

  it("rises toward the edge, up to the full speed", () => {
    const half = autoPanVelocity(AUTO_PAN_EDGE_PX / 2, 800, 400, 800);
    expect(half.vx).toBeCloseTo(-AUTO_PAN_SPEED_PX_S / 2);
    expect(half.vy).toBeCloseTo(AUTO_PAN_SPEED_PX_S);
    expect(autoPanVelocity(-50, 400, 400, 800).vx).toBe(-AUTO_PAN_SPEED_PX_S);
  });
});
