import type { ReadonlySignal } from "@preact/signals";
import type { HintId } from "./onboarding";
import { strings } from "./strings";

/** The shown hint, with its world target already placed on the screen. */
export type HintView = { id: HintId } & (
  { at: "screen"; x: number; y: number } | { at: "palette" }
);

/**
 * An onboarding hint (FR139): a capsule whose arrow points at its target,
 * a point on the map or the palette's "+" button. It lets touches through,
 * so the player can do what it asks right under it.
 */
export function Hint({ hint }: { hint: ReadonlySignal<HintView | null> }) {
  const view = hint.value;
  if (!view) return null;
  const style =
    view.at === "screen" ? { left: `${view.x}px`, top: `${view.y}px` } : {};
  return (
    <p class="hint" data-at={view.at} style={style} role="status">
      {strings.hints[view.id]}
    </p>
  );
}
