import { ExportStatus, useExportSave } from "./ExportSave";
import { strings } from "./strings";

interface Props {
  onReload: () => void;
  /** The save and the log buffer, as export text. */
  onExport: () => Promise<string>;
}

export function CrashScreen({ onReload, onExport }: Props) {
  const { status, run } = useExportSave(onExport);
  const text = strings.crash;

  return (
    <div class="crash" role="alertdialog" aria-labelledby="crash-title">
      <h1 id="crash-title">{text.title}</h1>
      <p>{text.body}</p>
      <div class="crash-actions">
        <button type="button" onClick={onReload}>
          {text.reload}
        </button>
        <button type="button" onClick={run}>
          {strings.save.export}
        </button>
      </div>
      <ExportStatus status={status} />
    </div>
  );
}
