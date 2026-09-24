import { useState } from "preact/hooks";
import type { FailReason, Result } from "../sim/result";
import { ExportStatus, useExportSave } from "./ExportSave";
import { strings } from "./strings";

export interface SaveProps {
  /** The current game as export text. */
  exportSave(): Promise<string>;
  /** Loads pasted export text over the current game. */
  importSave(text: string): Promise<Result>;
}

/**
 * The save actions of the settings menu (FR128): export the game as text,
 * copied to the clipboard, or paste an exported save to load it.
 */
export function SaveActions({
  exportSave,
  importSave,
  onClose,
}: SaveProps & {
  /** Closes the menu once a save is loaded. */
  onClose(): void;
}) {
  const text = strings.save;
  const exporting = useExportSave(exportSave);
  const [pasted, setPasted] = useState<string | null>(null);
  const [refused, setRefused] = useState<FailReason | null>(null);

  function load() {
    if (!pasted) return;
    importSave(pasted).then((result) => {
      if (result.ok) onClose();
      else setRefused(result.reason);
    });
  }

  return (
    <>
      <button
        type="button"
        class="menu-action"
        disabled={exporting.status.kind === "exporting"}
        onClick={exporting.run}
      >
        {text.export}
      </button>
      <ExportStatus status={exporting.status} />
      {pasted === null ? (
        <button type="button" class="menu-action" onClick={() => setPasted("")}>
          {text.import}
        </button>
      ) : (
        <>
          <p class="menu-note">{text.importNote}</p>
          <textarea
            class="save-text"
            aria-label={text.importText}
            value={pasted}
            onInput={(event) => {
              setPasted(event.currentTarget.value);
              setRefused(null);
            }}
          />
          <button
            type="button"
            class="menu-action"
            disabled={pasted.trim() === ""}
            onClick={load}
          >
            {text.load}
          </button>
          {refused && <p class="menu-refused">{strings.reasons[refused]}</p>}
        </>
      )}
    </>
  );
}
