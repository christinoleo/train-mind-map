import type { ReadonlySignal } from "@preact/signals";
import type { Focus } from "../render/layers";
import { strings } from "./strings";

interface Props {
  /** The layer in focus. */
  focus: ReadonlySignal<Focus>;
  /** True once the rail layer has anything to build: a Station is unlocked. */
  available: ReadonlySignal<boolean>;
  onToggle(): void;
}

/**
 * The layer toggle (FR78): brings the rail layer into focus, dimming the
 * factory, and back. The T key does the same.
 */
export function RailToggle({ focus, available, onToggle }: Props) {
  if (!available.value) return null;
  const text = strings.rail;
  const rails = focus.value === "rails";
  const label = rails ? text.factory : text.toggle;
  return (
    <button
      type="button"
      class="rail-toggle"
      aria-label={label}
      aria-pressed={rails}
      title={label}
      onClick={onToggle}
    >
      {rails ? text.factoryGlyph : text.glyph}
    </button>
  );
}
