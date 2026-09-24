import { useState } from "preact/hooks";
import { copyText } from "../platform/clipboard";
import { strings } from "./strings";

type Status =
  | { kind: "idle" | "exporting" | "exported" | "failed" }
  /** The clipboard refused; the text is shown to copy by hand. */
  | { kind: "manual"; text: string };

/**
 * Exporting a save: copies the text to the clipboard, or, when the clipboard
 * refuses, shows it to select and copy by hand (FR128).
 */
export function useExportSave(exportSave: () => Promise<string>) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  function run() {
    setStatus({ kind: "exporting" });
    const text = exportSave();
    copyText(text).then(
      () => setStatus({ kind: "exported" }),
      () =>
        text.then(
          (value) => setStatus({ kind: "manual", text: value }),
          () => setStatus({ kind: "failed" }),
        ),
    );
  }

  return { status, run };
}

/** What became of the export: a confirmation, or the text to copy. */
export function ExportStatus({ status }: { status: Status }) {
  const text = strings.save;
  if (status.kind === "idle" || status.kind === "exporting") return null;
  if (status.kind !== "manual") {
    return (
      <p class="save-status" role="status">
        {status.kind === "exported" ? text.exported : text.exportFailed}
      </p>
    );
  }
  return (
    <>
      <p class="save-status" role="status">
        {text.copyByHand}
      </p>
      <textarea
        class="save-text"
        readOnly
        value={status.text}
        aria-label={text.exportText}
        ref={(el) => el?.select()}
        onFocus={(event) => event.currentTarget.select()}
      />
    </>
  );
}
