import type { Signal } from "@preact/signals";
import { strings } from "./strings";

interface Props {
  /** True while the notice shows. */
  show: Signal<boolean>;
  onExport(): void;
  onDismiss(): void;
}

/** On iOS inside an iframe, suggests exporting the save (NFR14). */
export function ExportNotice({ show, onExport, onDismiss }: Props) {
  if (!show.value) return null;
  const text = strings.exportNotice;
  return (
    <div class="export-notice" role="status">
      <p>{text.body}</p>
      <button type="button" onClick={onExport}>
        {text.export}
      </button>
      <button type="button" onClick={onDismiss}>
        {text.dismiss}
      </button>
    </div>
  );
}
