import { useState } from "preact/hooks";
import { strings } from "./strings";

type ExportStatus = "idle" | "exported" | "failed";

interface Props {
  onReload: () => void;
  onExport: () => Promise<void>;
}

export function CrashScreen({ onReload, onExport }: Props) {
  const [status, setStatus] = useState<ExportStatus>("idle");
  const text = strings.crash;

  function exportSave() {
    onExport().then(
      () => setStatus("exported"),
      () => setStatus("failed"),
    );
  }

  return (
    <div class="crash" role="alertdialog" aria-labelledby="crash-title">
      <h1 id="crash-title">{text.title}</h1>
      <p>{text.body}</p>
      <div class="crash-actions">
        <button type="button" onClick={onReload}>
          {text.reload}
        </button>
        <button type="button" onClick={exportSave}>
          {text.exportSave}
        </button>
      </div>
      {status !== "idle" && (
        <p role="status">
          {status === "exported" ? text.exported : text.exportFailed}
        </p>
      )}
    </div>
  );
}
