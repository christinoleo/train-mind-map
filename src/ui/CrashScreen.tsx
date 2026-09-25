import { ExportStatus, useExportSave } from "./ExportSave";
import { StartOver, type StartOverProps } from "./StartOver";
import { strings } from "./strings";

interface Props extends StartOverProps {
  onReload: () => void;
  /** The save and the log buffer, as export text. */
  onExport: () => Promise<string>;
}

/**
 * "Algo deu errado" (FR144). A save that crashes on every load must not trap
 * the player, so the backup and a new game are offered too.
 */
export function CrashScreen({ onReload, onExport, ...startOver }: Props) {
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
        <StartOver {...startOver} />
      </div>
      <ExportStatus status={status} />
    </div>
  );
}
