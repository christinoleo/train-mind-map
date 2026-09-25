import type { ReadonlySignal } from "@preact/signals";
import type { ComponentChildren } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";
import type { ItemCounts } from "../data/items";
import type { FailReason } from "../sim/result";
import {
  placeBubble,
  type BubbleArea,
  type ScreenRect,
} from "./bubblePlacement";
import { shortCostText } from "./format";
import { strings } from "./strings";

/** Room kept between the bubble and the HUD or the palette. */
const CLEARANCE_PX = 8;

interface Props {
  /** What the bubble is about, for screen readers. */
  label: string;
  /** The node or tap point it points at, on the screen; `null` hides it. */
  anchor: ReadonlySignal<ScreenRect | null>;
  onClose(): void;
  children: ComponentChildren;
}

/**
 * The action bubble (FR19, FR59, FR133): a card floating next to the node
 * or edge tapped, with an arrow pointing at it, which follows the camera. It
 * sits above its anchor, or below near the top of the screen, and always
 * inside the screen, clear of the HUD and the palette. Esc closes it.
 */
export function ActionBubble({ label, anchor, onClose, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const rect = anchor.value;
  // After every render: the anchor moves with the camera, and the size
  // changes with the contents.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !rect) return;
    const { x, y, below, arrowX } = placeBubble(
      rect,
      { w: el.offsetWidth, h: el.offsetHeight },
      bubbleArea(),
    );
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.setProperty("--arrow-x", `${arrowX}px`);
    el.dataset.below = String(below);
  });
  if (!rect) return null;
  return (
    <div
      ref={ref}
      class="bubble"
      role="dialog"
      aria-label={label}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      {children}
    </div>
  );
}

/** The screen less the HUD at the top and the palette at the bottom. */
function bubbleArea(): BubbleArea {
  const { innerWidth: width, innerHeight: height } = window;
  const hud = document.querySelector("#ui-root > .hud .hud-capsule");
  const palette = document.querySelector("#ui-root > .palette");
  return {
    width,
    height,
    top: (hud?.getBoundingClientRect().bottom ?? 0) + CLEARANCE_PX,
    bottom: (palette?.getBoundingClientRect().top ?? height) - CLEARANCE_PX,
  };
}

/** One of the bubble's large buttons: an icon over a short label and a detail line. */
export function BubbleAction({
  glyph,
  label,
  detail,
  refused = null,
  pressed,
  danger = false,
  onClick,
}: {
  glyph: ComponentChildren;
  label: ComponentChildren;
  detail?: ComponentChildren;
  refused?: FailReason | null;
  /** Set on a toggle: whether it is on. */
  pressed?: boolean;
  danger?: boolean;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      class={danger ? "bubble-action bubble-danger" : "bubble-action"}
      disabled={refused !== null}
      aria-pressed={pressed}
      onClick={onClick}
    >
      <span class="bubble-glyph" aria-hidden="true">
        {glyph}
      </span>
      <span class="bubble-label">{label}</span>
      {detail && <span class="bubble-detail">{detail}</span>}
      {refused && (
        <span class="bubble-refused">{strings.reasons[refused]}</span>
      )}
    </button>
  );
}

/** The bubble's remove button, with what the removal gives back. */
export function BubbleRemove({
  refund,
  onClick,
}: {
  refund: Readonly<ItemCounts>;
  onClick(): void;
}) {
  return (
    <BubbleAction
      glyph={strings.bubble.removeGlyph}
      label={strings.menu.remove}
      detail={`${strings.menu.refund} ${shortCostText(refund)}`}
      danger
      onClick={onClick}
    />
  );
}
