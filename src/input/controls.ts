import type { Camera } from "./camera";
import { GestureTracker, type GesturePoint } from "./gestures";

/**
 * A tool that later epics plug in (place, connect, rail, move). It sees the
 * gestures the camera does not take; every method but `cancel` is optional.
 */
export interface Tool {
  /** A mouse moved with no button down. */
  hover?(p: GesturePoint): void;
  tap?(p: GesturePoint): void;
  longPress?(p: GesturePoint): void;
  /** The long press lifted without dragging. */
  holdEnd?(p: GesturePoint): void;
  /** Returns true to take the drag; otherwise the camera pans. */
  dragStart?(p: GesturePoint, from: GesturePoint, held: boolean): boolean;
  dragMove?(p: GesturePoint, dx: number, dy: number): void;
  dragEnd?(p: GesturePoint): void;
  /** Re-checks the tool's feedback against the state after each tick. */
  refresh?(): void;
  /** Runs once per drawn frame, `dtMs` after the last. */
  frame?(dtMs: number): void;
  /** Abandons the tool's work in progress (two fingers, Esc). */
  cancel(): void;
}

/** Wheel zoom per pixel of scroll: 100 px scrolled zooms by about 10%. */
const WHEEL_ZOOM_PER_PX = 0.001;
/** Pixels per line when the wheel reports lines rather than pixels. */
const WHEEL_LINE_PX = 16;
/** Elements whose own keyboard handling the controls must not override. */
const UI_KEY_TARGETS = "input, textarea, select, button, [contenteditable]";

/**
 * Connects pointer, wheel and keyboard input on `element` to the camera and
 * the active tool (FR12, FR13, FR134–FR136, FR138). A drag the tool does not
 * take pans the camera; the middle button and space + drag always pan.
 */
export class Controls {
  tool: Tool | null = null;
  /** Actions run by a key press, by `KeyboardEvent.code` (T: FR78). */
  readonly shortcuts = new Map<string, () => void>();
  private readonly gestures: GestureTracker;
  /** Who owns the current one-pointer drag. */
  private dragOwner: "camera" | "tool" | null = null;
  /** The current press must pan: middle button or space held. */
  private forcePan = false;
  private spaceHeld = false;

  constructor(
    private readonly camera: Camera,
    private readonly element: HTMLElement,
  ) {
    this.gestures = new GestureTracker({
      // A pan-only press never reaches the tool, even without moving.
      tap: (p) => {
        if (!this.forcePan) this.tool?.tap?.(p);
      },
      longPress: (p) => {
        if (!this.forcePan) this.tool?.longPress?.(p);
      },
      holdEnd: (p) => {
        if (!this.forcePan) this.tool?.holdEnd?.(p);
      },
      dragStart: (p, from, held) => {
        const toTool =
          !this.forcePan && this.tool?.dragStart?.(p, from, held) === true;
        this.dragOwner = toTool ? "tool" : "camera";
      },
      dragMove: (p, dx, dy) => {
        if (this.dragOwner === "tool") this.tool?.dragMove?.(p, dx, dy);
        else this.camera.panBy(dx, dy);
      },
      dragEnd: (p) => {
        if (this.dragOwner === "tool") this.tool?.dragEnd?.(p);
        this.dragOwner = null;
      },
      cancel: () => {
        this.dragOwner = null;
        this.cancelTool();
      },
      pinch: (x, y, dx, dy, factor) => {
        this.camera.panBy(dx, dy);
        this.camera.zoomAt(x, y, factor);
      },
    });
    element.addEventListener("pointerdown", this.onDown);
    element.addEventListener("pointermove", this.onMove);
    element.addEventListener("pointerup", this.onUp);
    element.addEventListener("pointercancel", this.onCancel);
    element.addEventListener("wheel", this.onWheel, { passive: false });
    element.addEventListener("contextmenu", preventDefault);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
  }

  /** Cancels the active tool's work in progress; the tool stays selected. */
  cancelTool() {
    this.tool?.cancel();
  }

  private point(e: PointerEvent | WheelEvent): GesturePoint {
    const rect = this.element.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private readonly onDown = (e: PointerEvent) => {
    // Only the left and middle buttons; a pen or finger reports button 0.
    if (e.button !== 0 && e.button !== 1) return;
    e.preventDefault();
    this.element.setPointerCapture?.(e.pointerId);
    if (e.isPrimary) this.forcePan = e.button === 1 || this.spaceHeld;
    const { x, y } = this.point(e);
    this.gestures.down(e.pointerId, x, y);
  };

  private readonly onMove = (e: PointerEvent) => {
    const { x, y } = this.point(e);
    if (e.pointerType === "mouse" && e.buttons === 0)
      this.tool?.hover?.({ x, y });
    this.gestures.move(e.pointerId, x, y);
  };

  private readonly onUp = (e: PointerEvent) => {
    this.gestures.up(e.pointerId);
  };

  private readonly onCancel = (e: PointerEvent) => {
    this.gestures.cancelPointer(e.pointerId);
  };

  private readonly onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const px = e.deltaMode === WheelEvent.DOM_DELTA_PIXEL ? 1 : WHEEL_LINE_PX;
    const { x, y } = this.point(e);
    this.camera.zoomAt(x, y, Math.exp(-e.deltaY * px * WHEEL_ZOOM_PER_PX));
  };

  private readonly onKeyDown = (e: KeyboardEvent) => {
    // Keys typed into the UI (a button, a text field) stay theirs.
    if (e.target instanceof Element && e.target.closest(UI_KEY_TARGETS)) {
      return;
    }
    if (e.key === "Escape") this.cancelTool();
    const shortcut = this.shortcuts.get(e.code);
    if (shortcut && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
      shortcut();
    }
    if (e.code === "Space") {
      e.preventDefault();
      this.setSpaceHeld(true);
    }
  };

  private readonly onKeyUp = (e: KeyboardEvent) => {
    if (e.code === "Space") this.setSpaceHeld(false);
  };

  private readonly onBlur = () => this.setSpaceHeld(false);

  private setSpaceHeld(held: boolean) {
    this.spaceHeld = held;
    this.element.style.cursor = held ? "grab" : "";
  }
}

function preventDefault(e: Event) {
  e.preventDefault();
}
