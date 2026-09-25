import type { ReadonlySignal } from "@preact/signals";
import { strings } from "./strings";

interface Props {
  /** True while the removal can still be undone from here. */
  shown: ReadonlySignal<boolean>;
  onUndo(): void;
}

/** "Removido · Desfazer", for a few seconds after a removal from the action bubble. */
export function RemovedToast({ shown, onUndo }: Props) {
  if (!shown.value) return null;
  const text = strings.bubble;
  return (
    <div class="toast" role="status">
      <span>{text.removed}</span>
      <button type="button" class="toast-action" onClick={onUndo}>
        {text.undo}
      </button>
    </div>
  );
}
