import type { ReadonlySignal } from "@preact/signals";
import { strings } from "./strings";

interface Props {
  /** True while there is a construction action to undo. */
  canUndo: ReadonlySignal<boolean>;
  onUndo(): void;
}

/** The ↶ button: undoes the last construction action (FR137). */
export function UndoButton({ canUndo, onUndo }: Props) {
  return (
    <button
      type="button"
      class="undo"
      aria-label={strings.undo.label}
      title={strings.undo.label}
      disabled={!canUndo.value}
      onClick={onUndo}
    >
      {strings.undo.glyph}
    </button>
  );
}
